import {
  DRIVE_SETTINGS,
  type DriveSettings,
  type DriveSettingsUpdate,
} from '@smarteverything/domain';
import type { Store } from '../store/store';

const DRIVE_SETTINGS_KEY = 'drive';

type SettingsStore = Pick<Store, 'settingsKv' | 'write'>;

export type DriveSettingsListener = (settings: DriveSettings, previous: DriveSettings) => void;

const LISTENERS = new WeakMap<object, Set<DriveSettingsListener>>();

export function onDriveSettingsChanged(
  store: Pick<Store, 'settingsKv'>,
  listener: DriveSettingsListener,
): () => void {
  const listeners = LISTENERS.get(store.settingsKv) ?? new Set<DriveSettingsListener>();
  listeners.add(listener);
  LISTENERS.set(store.settingsKv, listeners);
  return (): void => {
    listeners.delete(listener);
  };
}

export class DriveSettingsMissingError extends Error {
  override readonly name = 'DriveSettingsMissingError';

  constructor() {
    super('The drive settings row is missing; the drive storage migration seeds it.');
  }
}

const PARSED = new WeakMap<object, DriveSettings>();

export function readDriveSettings(store: Pick<Store, 'settingsKv'>): DriveSettings {
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

export function updateDriveSettings(
  store: SettingsStore,
  update: DriveSettingsUpdate,
): DriveSettings {
  const { previous, next } = store.write(() => {
    const changed = Object.fromEntries(
      Object.entries(update).filter(([, value]) => value !== undefined),
    );
    const before = readDriveSettings(store);
    const after = DRIVE_SETTINGS.parse({ ...before, ...changed });
    store.settingsKv.save(DRIVE_SETTINGS_KEY, after);
    return { previous: before, next: after };
  });
  for (const listener of [...(LISTENERS.get(store.settingsKv) ?? [])]) listener(next, previous);
  return next;
}
