import { Logger } from '@smarteverything/logging';
import { ValueStore, useValue } from '../design/external-store';
import { loadLocalPrefs, localPref, setLocalPref } from '../store/local-prefs';
import { activateFlag, activateFlags, developerFlags } from './flags';
import {
  DEVELOPER_TOGGLES,
  resolveFlags,
  toggleOf,
  type DeveloperFlagId,
  type StoredFlags,
} from './toggles';

const ready = new ValueStore(false);

function applyLogLevel(): void {
  Logger.configure({ level: developerFlags['log.debug'] ? 'debug' : 'info' });
}

function activate(stored: StoredFlags): void {
  activateFlags(resolveFlags(stored, __DEV__));
  applyLogLevel();
  ready.set(true);
}

export function startDeveloper(): Promise<void> {
  return loadLocalPrefs().then(
    () => {
      activate(localPref('developerFlags'));
    },
    () => {
      activate({});
    },
  );
}

export function useDeveloperReady(): boolean {
  return useValue(ready);
}

export function setDeveloperToggle(id: DeveloperFlagId, value: boolean): void {
  const stored = { ...localPref('developerFlags'), [id]: value };
  setLocalPref('developerFlags', stored);
  if (!toggleOf(id).reload) {
    activateFlag(id, resolveFlags(stored, __DEV__)[id]);
    applyLogLevel();
  }
}

export function reloadPending(stored: StoredFlags): boolean {
  const wanted = resolveFlags(stored, __DEV__);
  return DEVELOPER_TOGGLES.some(
    (toggle) => toggle.reload && wanted[toggle.id] !== developerFlags[toggle.id],
  );
}
