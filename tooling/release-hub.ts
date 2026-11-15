import { prepareHubData } from './release-hub-prepare.ts';
import { recordReleasedHub } from './release-hub-ledger.ts';
import { join } from 'node:path';
import { rollbackDryRun, rollbackWith } from './release-hub-rollback.ts';
export { rollbackWith, type RollbackOptions } from './release-hub-rollback.ts';
import { parseArgs } from 'node:util';
import { withIdleHubRelease } from '../apps/hub/src/self-update/release-lock.ts';
import { defaultHubInstall, HUB_INSTALL_DIRECTORY } from './hub-install-layout.ts';
import { HUB_UNIT } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import {
  backUpRelease,
  markBackup,
  ReleaseStepError,
  releaseSceneOf,
  serviceMigrationCheck,
  swapService,
  type ReleaseTarget,
} from './release-hub-files.ts';
import {
  assertStandaloneHubUnit,
  awaitHub,
  parseSchemaFlag,
  systemdUnits,
  verifyHub,
  type Check,
  type Units,
} from './release-hub-verify.ts';
import {
  applyTransition,
  environmentFrom,
  hasV1Marker,
  locateBackup,
  refreshHubUnit,
  releaseRoot,
  saveTransition,
  type Transition,
  type TransitionEnvironment,
} from './release-hub-transition.ts';
import {
  checkBuild,
  describe,
  finishRelease,
  migrationStep,
  settled,
  type Plan,
} from './release-hub-steps.ts';

const log = new Logger('tool.release-hub');

const USAGE = `usage:
  tsx tooling/release-hub.ts release  --name <release18> --notes <release notes> --service <built service dir> --url <hub https url> [--schema <n>] [--dry-run]
  tsx tooling/release-hub.ts rollback --backup <backups/releases/name-epoch> --url <hub https url> [--with-database] [--dry-run]
  tsx tooling/release-hub.ts verify   --url <hub https url> [--schema <n>]
  tsx tooling/release-hub.ts backup   --name <release18> [--dry-run]
  tsx tooling/release-hub.ts check    --service <built service dir> (its migrations on a copy of the live database)
options for every command: --install <dir> (default ~/${HUB_INSTALL_DIRECTORY}), --data <dir> (default: the data folder named by the pointer in the hub bootstrap folder)`;

export interface ReleaseOptions {
  readonly target: ReleaseTarget;
  readonly prepareData?: () => Promise<void>;
  readonly environment: TransitionEnvironment;
  readonly transition: Transition | null;
  readonly units: Units;
  readonly name: string;
  readonly notes: string;
  readonly built: string;
  readonly url: string;
  readonly schema: number | null;
  readonly epoch: number;
}

export function failedChecks(checks: readonly Check[]): readonly Check[] {
  return checks.filter((check) => !check.ok);
}

interface ReleaseState {
  backup: string;
  schemaMoved: boolean;
  startingSchema: number | null;
  startedAt: Date;
}

export class ReleaseAwaitingDecision extends Error {
  override readonly name = 'ReleaseAwaitingDecision';

  constructor(
    readonly backup: string,
    readonly rollback: string,
    cause: unknown,
  ) {
    super(
      `${describe(cause)}; the release stopped without rolling back and kept the backup ${backup}. Tell the owner, and only after the owner agrees run: ${rollback}`,
      { cause },
    );
  }
}

function rollbackCommand(options: ReleaseOptions, state: ReleaseState): string {
  const { target, transition, url } = options;
  const withDatabase = state.schemaMoved || (transition !== null && hasV1Marker(target.data.root));
  return [
    'tsx tooling/release-hub.ts rollback',
    `--backup ${state.backup}`,
    `--url ${url}`,
    `--install ${target.install.directory}`,
    `--data ${target.data.root}`,
    ...(withDatabase ? ['--with-database'] : []),
  ].join(' ');
}

function awaitDecision(cause: unknown, options: ReleaseOptions, state: ReleaseState): never {
  log.error('release.awaiting_decision', cause, { backup: state.backup });
  throw new ReleaseAwaitingDecision(state.backup, rollbackCommand(options, state), cause);
}

async function verifiedChecks(
  options: ReleaseOptions,
  state: ReleaseState,
): Promise<readonly Check[]> {
  const { target, transition, units, url, schema } = options;
  try {
    const checked = await verifyHub(transition?.after ?? target.data, url, units, schema);
    const failed = failedChecks(checked);
    if (failed.length > 0)
      throw new ReleaseStepError(
        'verify',
        failed.map((check) => `${check.name}: ${check.detail}`).join('; '),
      );
    return checked;
  } catch (cause) {
    log.error('release.verify_failed', cause);
    return awaitDecision(cause, options, state);
  }
}

async function verifyRelease(options: ReleaseOptions, state: ReleaseState): Promise<void> {
  const { target, transition } = options;
  const checks = await verifiedChecks(options, state);
  markBackup(locateBackup(target.data.root, state.backup), 'verified');
  recordReleasedHub({
    data: transition?.after ?? target.data,
    install: target.install.directory,
    notes: options.notes,
    url: options.url,
    backup: state.backup,
    startingSchema: state.startingSchema,
    changedDatabase: state.schemaMoved,
    checks,
    startedAt: state.startedAt,
    finishedAt: new Date(),
  });
}

async function restartRelease(options: ReleaseOptions, state: ReleaseState): Promise<void> {
  const { target, transition, environment, units, url } = options;
  try {
    if (transition !== null) await applyTransition(transition, environment, target.data.root);
    else await refreshHubUnit(target.install.directory, environment);
    await (
      options.prepareData ??
      ((): Promise<void> => prepareHubData(join(target.install.service, '../..'), target.data.root))
    )();
    const since = new Date();
    units.start(HUB_UNIT);
    await awaitHub((transition?.after ?? target.data).system.logs.service, url, since);
  } catch (cause) {
    awaitDecision(cause, options, state);
  }
}

async function captureRelease(options: ReleaseOptions): Promise<string> {
  const { target, name, epoch, transition, environment, units } = options;
  units.stop(HUB_UNIT);
  try {
    const backup = backUpRelease(target, name, epoch);
    if (transition !== null) saveTransition(backup, environment);
    log.info('release.backed_up', { backup });
    return backup;
  } catch (cause) {
    await startUnchanged(options);
    throw cause;
  }
}

async function startUnchanged({ target, units, url }: ReleaseOptions): Promise<void> {
  const since = new Date();
  units.start(HUB_UNIT);
  await awaitHub(target.data.system.logs.service, url, since);
}

async function swapRelease(options: ReleaseOptions, state: ReleaseState): Promise<void> {
  try {
    swapService(options.target.install, options.built, options.name);
  } catch (cause) {
    if (!(cause instanceof ReleaseStepError)) awaitDecision(cause, options, state);
    await startUnchanged(options);
    throw cause;
  }
}

export function releasePlan(options: ReleaseOptions): readonly Plan[] {
  const { target, environment, transition, name, built, url } = options;
  const { install, data } = target;
  const state: ReleaseState = {
    backup: '',
    schemaMoved: false,
    startingSchema: null,
    startedAt: new Date(),
  };
  return [
    {
      title: `check the built service in ${built} and the free space for the backup and the new service`,
      run: () =>
        settled(() => {
          checkBuild(target, built);
        }),
    },
    migrationStep(target, built, (from, to) => {
      state.schemaMoved = from !== to;
      state.startingSchema = from;
    }),
    {
      title: `back up ${install.service} and ${data.system.database.file} into ${data.backups.releases}`,
      run: async (): Promise<void> => {
        state.startedAt = new Date();
        state.backup = await captureRelease(options);
      },
    },
    {
      title: `swap ${install.service} for ${built}`,
      run: () => swapRelease(options, state),
    },
    {
      title: `${transition === null ? '' : `write the pending-v1 pointer in ${environment.bootstrap}, the new hub unit in ${environment.unitDirectory} and reload systemd, then `}restart ${HUB_UNIT}${transition === null ? ` with its unit in ${environment.unitDirectory} rewritten and systemd reloaded` : ''} and wait until it reports started and answers at ${url}`,
      run: () => restartRelease(options, state),
    },
    {
      title:
        'verify the hub; a failed check stops the release with the backup kept, and nothing is rolled back until the owner says so',
      run: () => verifyRelease(options, state),
    },
    {
      title: `delete the replaced service ${install.service}.old-${name}, earlier rolled-back leftovers and verified release backups`,
      run: () =>
        settled(() => {
          finishRelease({ install, data: transition?.after ?? data }, name);
        }),
    },
  ];
}

async function execute(plan: readonly Plan[], dryRun: boolean): Promise<void> {
  for (const step of plan) {
    process.stdout.write(`${dryRun ? 'would ' : ''}${step.title}\n`);
    if (!dryRun) await step.run();
  }
}

function required(value: string | undefined, flag: string): string {
  if (value === undefined) throw new Error(`${flag} is required.\n${USAGE}`);
  return value;
}

function printChecks(checks: readonly Check[]): void {
  for (const check of checks) {
    process.stdout.write(`${check.ok ? 'ok  ' : 'FAIL'} ${check.name}: ${check.detail}\n`);
  }
  if (failedChecks(checks).length > 0) process.exitCode = 1;
}

async function mutateRelease(
  target: ReleaseTarget,
  dryRun: boolean,
  work: () => Promise<void>,
): Promise<void> {
  if (dryRun) {
    await work();
    return;
  }
  await withIdleHubRelease(target.data, work);
}

const CLI = {
  allowPositionals: true,
  options: {
    name: { type: 'string' },
    notes: { type: 'string' },
    service: { type: 'string' },
    backup: { type: 'string' },
    url: { type: 'string' },
    schema: { type: 'string' },
    install: { type: 'string' },
    data: { type: 'string' },
    'dry-run': { type: 'boolean' },
    'with-database': { type: 'boolean' },
  },
} as const;

type CliValues = ReturnType<typeof parseArgs<typeof CLI>>['values'];

interface Invocation {
  readonly target: ReleaseTarget;
  readonly environment: TransitionEnvironment;
  readonly transition: Transition | null;
  readonly values: CliValues;
  readonly schema: number | null;
  readonly dryRun: boolean;
  readonly epoch: number;
}

async function release(invocation: Invocation): Promise<void> {
  const { target, environment, transition, values, schema, dryRun, epoch } = invocation;
  const plan = releasePlan({
    target,
    environment,
    transition,
    units: systemdUnits,
    name: required(values.name, '--name'),
    notes: required(values.notes, '--notes'),
    built: required(values.service, '--service'),
    url: required(values.url, '--url'),
    schema,
    epoch,
  });
  await mutateRelease(target, dryRun, () => execute(plan, dryRun));
}

async function rollback({ target, environment, values, dryRun, epoch }: Invocation): Promise<void> {
  const backup = required(values.backup, '--backup');
  const withDatabase = values['with-database'] === true;
  if (dryRun) {
    rollbackDryRun(target, environment, backup, withDatabase);
    return;
  }
  await mutateRelease(target, false, async () => {
    process.stdout.write(`rolling ${target.install.service} back from ${backup}\n`);
    await rollbackWith({
      target,
      environment,
      units: systemdUnits,
      backup,
      url: required(values.url, '--url'),
      withDatabase,
      stamp: String(epoch),
    });
  });
}

function needsInstalledHub(command: string | undefined, dryRun: boolean): boolean {
  return (
    !dryRun &&
    (command === 'release' ||
      command === 'rollback' ||
      command === 'verify' ||
      command === 'backup')
  );
}

async function backupCommand({ target, values, dryRun, epoch }: Invocation): Promise<void> {
  if (dryRun) {
    process.stdout.write(`would back up to ${target.data.backups.releases}\n`);
    return;
  }
  await mutateRelease(target, false, () =>
    settled(() => {
      const made = backUpRelease(target, required(values.name, '--name'), epoch);
      process.stdout.write(`backed up to ${made}\n`);
    }),
  );
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs(CLI);
  const install = values.install ?? defaultHubInstall();
  const environment = environmentFrom();
  const root = values.data ?? (await releaseRoot(environment));
  const { target, transition } = releaseSceneOf(install, root);
  const dryRun = values['dry-run'] === true;
  const schema = parseSchemaFlag(values.schema);
  const invocation: Invocation = {
    target,
    environment,
    transition,
    values,
    schema,
    dryRun,
    epoch: Math.floor(Date.now() / 1000),
  };
  if (needsInstalledHub(positionals[0], dryRun)) assertStandaloneHubUnit(install);
  switch (positionals[0]) {
    case 'release':
      await release(invocation);
      return;
    case 'rollback':
      await rollback(invocation);
      return;
    case 'verify':
      printChecks(
        await verifyHub(target.data, required(values.url, '--url'), systemdUnits, schema),
      );
      return;
    case 'backup':
      await backupCommand(invocation);
      return;
    case 'check':
      process.stdout.write(
        `${JSON.stringify(
          serviceMigrationCheck(
            process.execPath,
            required(values.service, '--service'),
            target.data,
          ),
        )}\n`,
      );
      return;
    case undefined:
    default:
      throw new Error(USAGE);
  }
}

if (import.meta.main) await main();
