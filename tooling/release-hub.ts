import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { clearPhotoFolderReceipts, restorePhotoFolders } from './release-photo-folders.ts';
import { parseArgs } from 'node:util';
import { withIdleHubRelease } from '../apps/hub/src/self-update/release-lock.ts';
import { defaultHubInstall, HUB_INSTALL_DIRECTORY } from './hub-install-layout.ts';
import { HUB_UNIT } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import {
  backUpRelease,
  checkMigrations,
  markBackup,
  ReleaseStepError,
  restoreDatabase,
  restoreService,
  releaseSceneOf,
  rollbackPreflight,
  schemaVersionOf,
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
  CROSSING_STEPS,
  environmentFrom,
  hasV1Marker,
  legacyLayoutOf,
  locateBackup,
  releaseRoot,
  saveTransition,
  undoV1,
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
  tsx tooling/release-hub.ts release  --name <release18> --service <built service dir> --url <hub https url> [--schema <n>] [--dry-run]
  tsx tooling/release-hub.ts rollback --backup <backups/releases/name-epoch> --url <hub https url> [--with-database] [--dry-run]
  tsx tooling/release-hub.ts verify   --url <hub https url> [--schema <n>]
  tsx tooling/release-hub.ts backup   --name <release18> [--dry-run]
  tsx tooling/release-hub.ts check    (migrations on a copy of the live database)
options for every command: --install <dir> (default ~/${HUB_INSTALL_DIRECTORY}), --data <dir> (default: the data folder named by the pointer in the hub bootstrap folder)`;

export interface ReleaseOptions {
  readonly target: ReleaseTarget;
  readonly environment: TransitionEnvironment;
  readonly transition: Transition | null;
  readonly units: Units;
  readonly name: string;
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
}

async function rollbackAfter(
  cause: unknown,
  options: ReleaseOptions,
  state: ReleaseState,
): Promise<never> {
  const { target, transition, environment, units, url, epoch } = options;
  try {
    await rollbackWith({
      target,
      environment,
      units,
      backup: state.backup,
      url,
      withDatabase: state.schemaMoved || (transition !== null && hasV1Marker(target.data.root)),
      stamp: String(epoch),
    });
  } catch (rollbackCause) {
    log.error('release.rollback_failed', rollbackCause);
    throw new AggregateError(
      [cause, rollbackCause],
      `${describe(cause)}; the rollback also failed: ${describe(rollbackCause)}`,
      { cause: rollbackCause },
    );
  }
  throw cause;
}

async function verifyRelease(options: ReleaseOptions, state: ReleaseState): Promise<void> {
  const { target, transition, units, url, schema } = options;
  try {
    const checked = await verifyHub(transition?.after ?? target.data, url, units, schema);
    const failed = failedChecks(checked);
    if (failed.length > 0)
      throw new ReleaseStepError(
        'verify',
        failed.map((check) => `${check.name}: ${check.detail}`).join('; '),
      );
  } catch (cause) {
    log.error('release.verify_failed', cause);
    return rollbackAfter(cause, options, state);
  }
  markBackup(locateBackup(target.data.root, state.backup), 'verified');
}

async function restartRelease(options: ReleaseOptions, state: ReleaseState): Promise<void> {
  const { target, transition, environment, units, url } = options;
  try {
    if (transition !== null) await applyTransition(transition, environment, target.data.root);
    const since = new Date();
    units.restart(HUB_UNIT);
    await awaitHub((transition?.after ?? target.data).system.logs.service, url, since);
  } catch (cause) {
    return rollbackAfter(cause, options, state);
  }
}

export function releasePlan(options: ReleaseOptions): readonly Plan[] {
  const { target, environment, transition, name, built, url, epoch } = options;
  const { install, data } = target;
  const state: ReleaseState = { backup: '', schemaMoved: false };
  return [
    {
      title: `check the built service in ${built} and the free space for the backup and the new service`,
      run: () =>
        settled(() => {
          checkBuild(target, built);
        }),
    },
    migrationStep(target, (moved) => {
      state.schemaMoved = moved;
    }),
    {
      title: `back up ${install.service} and ${data.system.database.file} into ${data.backups.releases}`,
      run: () =>
        settled(() => {
          state.backup = backUpRelease(target, name, epoch);
          if (transition !== null) saveTransition(state.backup, environment);
          log.info('release.backed_up', { backup: state.backup });
        }),
    },
    {
      title: `swap ${install.service} for ${built}`,
      run: () =>
        settled(() => {
          swapService(install, built, name);
        }),
    },
    {
      title: `${transition === null ? '' : `write the pending-v1 pointer in ${environment.bootstrap}, the new hub unit in ${environment.unitDirectory} and reload systemd, then `}restart ${HUB_UNIT} and wait until it reports started and answers at ${url}`,
      run: () => restartRelease(options, state),
    },
    {
      title:
        'verify the hub; any failed check rolls the service back, and the database too when the migration moved the schema',
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

export interface RollbackOptions {
  readonly target: ReleaseTarget;
  readonly environment: TransitionEnvironment;
  readonly units: Units;
  readonly backup: string;
  readonly url: string;
  readonly withDatabase: boolean;
  readonly stamp: string;
}

export async function rollbackWith(options: RollbackOptions): Promise<void> {
  const { target, environment, units, backup, url, withDatabase, stamp } = options;
  const { install } = target;
  const { scene, problems } = rollbackPreflight(target, backup, withDatabase, environment);
  if (problems.length > 0) throw new ReleaseStepError('rollback preflight', problems.join('; '));
  units.stop(HUB_UNIT);
  const data = scene.undo ? legacyLayoutOf(target.data.root) : target.data;
  const restored = scene.undo ? await undoV1(data.root, scene.backup, environment) : scene.backup;
  const savedDatabase = join(restored, 'smarteverything.db');
  const movedFiles = existsSync(savedDatabase) && restorePhotoFolders(savedDatabase);
  const restoreSavedDatabase = withDatabase || movedFiles;
  restoreService(install, restored, stamp);
  if (restoreSavedDatabase) restoreDatabase(data, restored, stamp);
  const since = new Date();
  units.start(HUB_UNIT);
  await awaitHub(data.system.logs.service, url, since);
  const expected = restoreSavedDatabase ? schemaVersionOf(savedDatabase) : null;
  const checked = await verifyHub(data, url, units, expected);
  const failed = failedChecks(checked);
  if (failed.length > 0)
    throw new ReleaseStepError(
      'rollback verification',
      failed.map((check) => check.detail).join('; '),
    );
  markBackup(restored, 'rolled-back');
  clearPhotoFolderReceipts(join(restored, 'smarteverything.db'));
  finishRelease({ install, data }, stamp);
  log.info('release.rolled_back', { backup: restored, withDatabase: restoreSavedDatabase });
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
    built: required(values.service, '--service'),
    url: required(values.url, '--url'),
    schema,
    epoch,
  });
  await mutateRelease(target, dryRun, () => execute(plan, dryRun));
}

function rollbackDryRun(
  target: ReleaseTarget,
  environment: TransitionEnvironment,
  backup: string,
  withDatabase: boolean,
): void {
  const { scene, problems } = rollbackPreflight(target, backup, withDatabase, environment);
  for (const problem of problems) process.stdout.write(`FAIL ${problem}\n`);
  if (problems.length > 0) {
    process.exitCode = 1;
    return;
  }
  const steps = scene.undo ? CROSSING_STEPS : [];
  for (const step of steps) process.stdout.write(`would ${step}\n`);
  process.stdout.write(
    `would roll ${target.install.service} back from ${scene.backup}; the backup layout and free space are fine\n`,
  );
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
      process.stdout.write(`${JSON.stringify(await checkMigrations(target.data))}\n`);
      return;
    case undefined:
    default:
      throw new Error(USAGE);
  }
}

if (import.meta.main) await main();
