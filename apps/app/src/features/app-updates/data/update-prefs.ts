import { localPref, setLocalPref, type LocalPrefValue } from '../../../store/local-prefs';

export type AppUpdatePrefs = LocalPrefValue<'appUpdates'>;

export function appUpdatePrefs(): AppUpdatePrefs {
  return localPref('appUpdates');
}

export function changeAppUpdatePrefs(change: Partial<AppUpdatePrefs>): void {
  setLocalPref('appUpdates', { ...localPref('appUpdates'), ...change });
}
