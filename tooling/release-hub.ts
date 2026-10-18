import { rmSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { Logger } from '@smarteverything/logging';
import {
  backUpRelease,
  builtServiceProblems,
  checkMigrations,
  freeSpaceProblem,
  hubLayout,
  ReleaseStepError,
  restoreDatabase,
  restoreService,
  swapService,
  type HubLayout,
} from './release-hub-files.ts';
import {
  awaitHub,
  HUB_UNIT,
  NODE_UNIT,
  systemdUnits,
  verifyHub,
  type Check,
  type Units,
} from './release-hub-verify.ts';

const log = new Logger('tool.release-hub');

const USAGE = `usage:
  tsx tooling/release-hub.ts release  --name <release18> --service <built service dir> --url <hub https url> [--schema <n>] [--dry-run]
  tsx tooling/release-hub.ts rollback --backup <release-backups/name-epoch> --url <hub https url> [--with-database] [--dry-run]
  tsx tooling/release-hub.ts verify   --url <hub https url> [--schema <n>]
  tsx tooling/release-hub.ts backup   --name <release18> [--dry-run]
  tsx tooling/release-hub.ts check    (migrations on a copy of the live database)
options for every command: --install <dir> (default ~/.local/opt/SmartEverything), --data <dir> (default ~/.config/SmartEverything)`;

export interface Plan {
  readonly title: string;
  readonly run: () => Promise<void>;
}

export interface ReleaseOptions {
  readonly layout: HubLayout;
  readonly units: Units;
  readonly name: string;
  readonly built: string;
  readonly url: string;
  readonly schema: number | null;
  readonly epoch: number;
}

function settled(work: () => void): Promise<void> {
  try {
    work();
    return Promise.resolve();
  } catch (cause) {
    return Promise.reject(cause instanceof Error ? cause : new Error(String(cause)));
  }
}

export function failedChecks(checks: readonly Check[]): readonly Check[] {
  return checks.filter((check) => !check.ok);
}

async function restartBoth(units: Units, url: string): Promise<void> {
  units.restart(HUB_UNIT);
  await awaitHub(url);
  units.restart(NODE_UNIT);
}

export function releasePlan(options: ReleaseOptions): readonly Plan[] {
  const { layout, units, name, built, url, schema, epoch } = options;
  let backup = '';
  return [
    {
      title: `check the built service in ${built} and the free space in ${layout.data}`,
      run: () =>
        settled(() => {
          const space = freeSpaceProblem(layout);
          const problems = [...builtServiceProblems(built), ...(space === null ? [] : [space])];
          if (problems.length > 0) throw new ReleaseStepError('preflight', problems.join('; '));
        }),
    },
    {
      title: `back up ${layout.service} and ${layout.database} into ${layout.backups}`,
      run: () =>
        settled(() => {
          backup = backUpRelease(layout, name, epoch);
          log.info('release.backed_up', { backup });
        }),
    },
    {
      title: 'run the migrations twice on a copy of the live database',
      run: async () => {
        const { from, to } = await checkMigrations(layout);
        log.info('release.migrations_checked', { from, to });
      },
    },
    {
      title: `swap ${layout.service} for ${built}`,
      run: () =>
        settled(() => {
          swapService(layout, built, name);
        }),
    },
    {
      title: `restart ${HUB_UNIT}, wait until it answers at ${url}, then restart ${NODE_UNIT}`,
      run: () => restartBoth(units, url),
    },
    {
      title: 'verify the hub; any failed check rolls the service and database back',
      run: async () => {
        const failed = failedChecks(await verifyHub(layout, url, units, schema));
        if (failed.length === 0) return;
        log.error('release.verify_failed', undefined, {
          failed: failed.map((check) => check.name),
        });
        await rollbackWith({
          layout,
          units,
          backup,
          url,
          withDatabase: true,
          stamp: String(epoch),
        });
        throw new ReleaseStepError(
          'verify',
          failed.map((check) => `${check.name}: ${check.detail}`).join('; '),
        );
      },
    },
    {
      title: `delete the replaced service ${layout.service}.old-${name}`,
      run: () =>
        settled(() => {
          rmSync(`${layout.service}.old-${name}`, { recursive: true, force: true });
        }),
    },
  ];
}

export interface RollbackOptions {
  readonly layout: HubLayout;
  readonly units: Units;
  readonly backup: string;
  readonly url: string;
  readonly withDatabase: boolean;
  readonly stamp: string;
}

export async function rollbackWith(options: RollbackOptions): Promise<void> {
  const { layout, units, backup, url, withDatabase, stamp } = options;
  units.stop(NODE_UNIT);
  units.stop(HUB_UNIT);
  restoreService(layout, backup, stamp);
  if (withDatabase) restoreDatabase(layout, backup, stamp);
  units.start(HUB_UNIT);
  await awaitHub(url);
  units.start(NODE_UNIT);
  log.info('release.rolled_back', { backup, withDatabase });
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

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
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
  });
  const layout = hubLayout(values.install, values.data);
  const schema = values.schema === undefined ? null : Number(values.schema);
  const dryRun = values['dry-run'] === true;
  const epoch = Math.floor(Date.now() / 1000);
  switch (positionals[0]) {
    case 'release':
      await execute(
        releasePlan({
          layout,
          units: systemdUnits,
          name: required(values.name, '--name'),
          built: required(values.service, '--service'),
          url: required(values.url, '--url'),
          schema,
          epoch,
        }),
        dryRun,
      );
      return;
    case 'rollback':
      process.stdout.write(
        `${dryRun ? 'would roll' : 'rolling'} ${layout.service} back from ${required(values.backup, '--backup')}\n`,
      );
      if (!dryRun)
        await rollbackWith({
          layout,
          units: systemdUnits,
          backup: required(values.backup, '--backup'),
          url: required(values.url, '--url'),
          withDatabase: values['with-database'] === true,
          stamp: String(epoch),
        });
      return;
    case 'verify':
      printChecks(await verifyHub(layout, required(values.url, '--url'), systemdUnits, schema));
      return;
    case 'backup':
      process.stdout.write(`${dryRun ? 'would back up to' : 'backed up to'} ${layout.backups}\n`);
      if (!dryRun)
        process.stdout.write(`${backUpRelease(layout, required(values.name, '--name'), epoch)}\n`);
      return;
    case 'check':
      process.stdout.write(`${JSON.stringify(await checkMigrations(layout))}\n`);
      return;
    default:
      throw new Error(USAGE);
  }
}

if (import.meta.main) await main();
