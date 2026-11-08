import { CLIENT_PREFS, type LayoutRow } from '@smarteverything/domain';
import { Logger, type LogLevel } from '@smarteverything/logging';
import { syncNativeLogLevel } from '../../modules/health-connect/src/native-log';
import { shipLevelOf } from '../platform/ship-level';
import { errorFields } from '../design/log-tally';
import { loadLocalPrefs, localPref } from '../store/local-prefs';
import { savePref } from '../store/prefs';
import type { EntityStore } from '../store/entity-store';
import type { StoreState, Table } from '../store/state';
import { activateFlags } from './flags';
import { unlockedIn } from './panel';
import {
  allOff,
  resolveFlags,
  type DeveloperFlagId,
  type DeveloperFlags,
  type StoredFlags,
} from './toggles';

const log = new Logger('app.developer');

const FLAGS = CLIENT_PREFS.developer_flags;

export interface DeveloperMode {
  readonly developer: boolean;
  readonly stored: StoredFlags;
}

const NOT_ON: DeveloperMode = { developer: false, stored: {} };

const NONE: DeveloperFlags = allOff();

function flagsOf(row: LayoutRow | undefined): StoredFlags {
  if (row === undefined) {
    return {};
  }
  const read = FLAGS.decode(row.layout);
  return read.status === 'invalid' ? {} : read.value.flags;
}

export function savedFlags(layouts: Table<LayoutRow>): StoredFlags {
  return flagsOf(layouts.byId[FLAGS.storageKey]);
}

export function flagsRow(state: StoreState): LayoutRow | null {
  return state.tables.layouts.byId[FLAGS.storageKey] ?? null;
}

export function developerMode(state: StoreState): DeveloperMode {
  if (!unlockedIn(state)) {
    return NOT_ON;
  }
  return {
    developer: true,
    stored: savedFlags(state.tables.layouts),
  };
}

export function flagsIn(mode: DeveloperMode): DeveloperFlags {
  return resolveFlags(mode.stored, mode.developer);
}

export function logLevelOf(flags: DeveloperFlags): LogLevel {
  const shipping = shipLevelOf(flags);
  if (flags['log.level.trace'] || shipping === 'trace') return 'trace';
  return flags['log.level.debug'] || shipping === 'debug' ? 'debug' : 'info';
}

export function applyFlags(state: StoreState): DeveloperFlags {
  const flags = flagsIn(developerMode(state));
  activateFlags(flags);
  const level = logLevelOf(flags);
  const changed = Logger.level !== level;
  Logger.configure({ level });
  if (changed) {
    syncNativeLogLevel();
    log.info('log_level.changed', { level });
  }
  return flags;
}

export function saveFlags(store: EntityStore, stored: StoredFlags): void {
  savePref(store, FLAGS, { flags: stored });
}

export function toggleFlag(store: EntityStore, id: DeveloperFlagId, value: boolean): void {
  saveFlags(store, { ...savedFlags(store.get().tables.layouts), [id]: value });
}

export function unlockedFlags(state: StoreState): DeveloperFlags {
  return unlockedIn(state) ? flagsIn(developerMode(state)) : NONE;
}

export function startDeveloper(): Promise<void> {
  return loadLocalPrefs().then(
    () => {
      log.info('developer_flags.ready', {
        legacy: Object.keys(localPref('developerFlags')).length,
      });
    },
    (error: unknown) => {
      log.warn('developer_flags.load_failed', { fallback: 'defaults', ...errorFields(error) });
    },
  );
}
