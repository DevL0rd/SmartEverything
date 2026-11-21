import {
  DRIVE_SETTINGS,
  type DriveSettings,
  type DriveSettingsUpdate,
} from '@smarteverything/domain';
import type { Store } from '../store/store';
import { DRIVE_SETTINGS_KEY, DriveSettingsMissingError } from './settings-key';

type SettingsStore = Pick<Store, 'host'>;

export type DriveSettingsListener = (settings: DriveSettings, previous: DriveSettings) => void;

const LISTENERS = new WeakMap<object, Set<DriveSettingsListener>>();

export function onDriveSettingsChanged(
  store: SettingsStore,
  listener: DriveSettingsListener,
): () => void {
  const listeners = LISTENERS.get(store.host) ?? new Set<DriveSettingsListener>();
  listeners.add(listener);
  LISTENERS.set(store.host, listeners);
  return (): void => {
    listeners.delete(listener);
  };
}

export async function loadDriveSettings(store: SettingsStore): Promise<DriveSettings> {
  const saved = await store.host.call('settingsKv', 'read', DRIVE_SETTINGS_KEY);
  if (saved === null) {
    throw new DriveSettingsMissingError();
  }
  return DRIVE_SETTINGS.parse(saved);
}

export async function updateDriveSettings(
  store: SettingsStore,
  update: DriveSettingsUpdate,
): Promise<DriveSettings> {
  const { previous, next } = await store.host.write('driveSettingsUpdate', update);
  for (const listener of [...(LISTENERS.get(store.host) ?? [])]) listener(next, previous);
  return next;
}
