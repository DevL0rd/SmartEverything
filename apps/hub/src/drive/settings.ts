import {
  DRIVE_SETTINGS,
  type DriveSettings,
  type DriveSettingsUpdate,
} from '@smarteverything/domain';
import type { Store } from '../store/store';

const DRIVE_SETTINGS_KEY = 'drive';

type SettingsStore = Pick<Store, 'settingsKv' | 'write'>;

export class DriveSettingsMissingError extends Error {
  override readonly name = 'DriveSettingsMissingError';

  constructor() {
    super('The drive settings row is missing; the drive storage migration seeds it.');
  }
}

export function readDriveSettings(store: Pick<Store, 'settingsKv'>): DriveSettings {
  const saved = store.settingsKv.read(DRIVE_SETTINGS_KEY);
  if (saved === null) {
    throw new DriveSettingsMissingError();
  }
  return DRIVE_SETTINGS.parse(saved);
}

export function updateDriveSettings(
  store: SettingsStore,
  update: DriveSettingsUpdate,
): DriveSettings {
  return store.write(() => {
    const changed = Object.fromEntries(
      Object.entries(update).filter(([, value]) => value !== undefined),
    );
    const next = DRIVE_SETTINGS.parse({ ...readDriveSettings(store), ...changed });
    store.settingsKv.save(DRIVE_SETTINGS_KEY, next);
    return next;
  });
}
