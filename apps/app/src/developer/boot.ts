import { Logger } from '@smarteverything/logging';
import { syncNativeLogLevel } from '../../modules/health-connect/src/native-log';
import { errorFields } from '../design/log-tally';
import { loadLocalPrefs, localPref, setLocalPref } from '../store/local-prefs';
import { activateFlags, readDeveloperFlags } from './flags';
import { withAllProfiling } from './profiling-master';
import { DEVELOPER_TOGGLES, resolveFlags, type DeveloperFlagId, type StoredFlags } from './toggles';

const log = new Logger('app.developer');

function applyLogLevel(): void {
  const level = readDeveloperFlags()['log.debug'] ? 'debug' : 'info';
  const changed = Logger.level !== level;
  Logger.configure({ level });
  syncNativeLogLevel();
  if (changed) log.info('log_level.changed', { level });
}

function activate(stored: StoredFlags): void {
  activateFlags(resolveFlags(stored, __DEV__));
  applyLogLevel();
}

export function startDeveloper(): Promise<void> {
  return loadLocalPrefs().then(
    () => {
      const stored = localPref('developerFlags');
      log.info('developer_flags.loaded', { stored: Object.keys(stored).length });
      activate(stored);
    },
    (error: unknown) => {
      log.warn('developer_flags.load_failed', { fallback: 'defaults', ...errorFields(error) });
      activate({});
    },
  );
}

function store(stored: StoredFlags): void {
  log.info('developer_flags.stored', { stored: Object.keys(stored).length });
  setLocalPref('developerFlags', stored);
  const wanted = resolveFlags(stored, __DEV__);
  const current = readDeveloperFlags();
  const live = Object.fromEntries(
    DEVELOPER_TOGGLES.filter((toggle) => !toggle.reload).map((toggle) => [
      toggle.id,
      wanted[toggle.id],
    ]),
  );
  activateFlags({ ...current, ...live });
  applyLogLevel();
}

export function setDeveloperToggle(id: DeveloperFlagId, value: boolean): void {
  store({ ...localPref('developerFlags'), [id]: value });
}

export function setAllProfiling(on: boolean): void {
  store(withAllProfiling(localPref('developerFlags'), on));
}

export function reloadPending(stored: StoredFlags): boolean {
  const wanted = resolveFlags(stored, __DEV__);
  return DEVELOPER_TOGGLES.some(
    (toggle) => toggle.reload && wanted[toggle.id] !== readDeveloperFlags()[toggle.id],
  );
}
