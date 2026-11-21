import {
  DRIVE_SETTINGS,
  type DriveSettings,
  type DriveSettingsUpdate,
} from '@smarteverything/domain';
import { storeUnit } from '../../store/host/unit';
import type { HostStore } from '../../store/host/host-store';
import { DRIVE_SETTINGS_KEY, DriveSettingsMissingError } from '../settings-key';

const PARSED = new WeakMap<object, DriveSettings>();

export function readDriveSettings(store: Pick<HostStore, 'settingsKv'>): DriveSettings {
  const saved = store.settingsKv.read(DRIVE_SETTINGS_KEY);
  if (saved === null) {
    throw new DriveSettingsMissingError();
  }
  const known = PARSED.get(saved);
  if (known !== undefined) return known;
  const parsed = DRIVE_SETTINGS.parse(saved);
  PARSED.set(saved, parsed);
  return parsed;
}

export interface DriveSettingsChange {
  readonly previous: DriveSettings;
  readonly next: DriveSettings;
}

export function saveDriveSettings(
  store: Pick<HostStore, 'settingsKv' | 'write'>,
  update: DriveSettingsUpdate,
): DriveSettingsChange {
  return store.write(() => {
    const changed = Object.fromEntries(
      Object.entries(update).filter(([, value]) => value !== undefined),
    );
    const previous = readDriveSettings(store);
    const next = DRIVE_SETTINGS.parse({ ...previous, ...changed });
    store.settingsKv.save(DRIVE_SETTINGS_KEY, next);
    return { previous, next };
  });
}

export const DRIVE_SETTINGS_UPDATE_UNIT = storeUnit(saveDriveSettings);
