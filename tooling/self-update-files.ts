import { join } from 'node:path';
import { HUB_UPDATE_LEDGER_FILE } from '@smarteverything/domain';
import type { HubLayout } from '../apps/hub/src/data-layout/index.ts';
import { UPDATE_ENTRY_FILES } from './hub-install-layout.ts';

const ROOT = join(import.meta.dirname, '..');

const WATCHDOG_ENTRY = join(ROOT, 'tooling', 'self-update-watchdog.ts');

const STEP_ENTRY = join(ROOT, 'tooling', 'self-update-step.ts');

const HUB_COMMAND_ENTRY = join(ROOT, 'tooling', 'self-update-hub-command.ts');

const STORE_HOST_ENTRY = join(ROOT, 'apps', 'hub', 'src', 'store', 'host', 'worker.ts');

const MIGRATION_CHECK_ENTRY = join(
  ROOT,
  'apps',
  'hub',
  'src',
  'self-update',
  'migration-check-main.ts',
);

export const UPDATE_ENTRIES: readonly {
  readonly entry: string;
  readonly file: string;
}[] = [
  { entry: HUB_COMMAND_ENTRY, file: UPDATE_ENTRY_FILES.hubCommand },
  { entry: WATCHDOG_ENTRY, file: UPDATE_ENTRY_FILES.watchdog },
  { entry: STEP_ENTRY, file: UPDATE_ENTRY_FILES.step },
  { entry: MIGRATION_CHECK_ENTRY, file: UPDATE_ENTRY_FILES.migrationCheck },
  { entry: STORE_HOST_ENTRY, file: UPDATE_ENTRY_FILES.storeHost },
];

export interface SelfUpdatePaths {
  readonly work: string;
  readonly ledger: string;
  readonly health: string;
  readonly log: string;
  readonly watchdogLog: string;
}

export function selfUpdatePaths(layout: HubLayout): SelfUpdatePaths {
  const work = layout.system.updates.selfUpdate;
  return {
    work,
    ledger: join(work, HUB_UPDATE_LEDGER_FILE),
    health: join(work, 'healthy'),
    log: layout.system.logs.hubUpdateWatchdog,
    watchdogLog: join(work, 'watchdog.log'),
  };
}

export { latestRelease, readLedger, writeLedger } from './self-update-ledger.ts';
