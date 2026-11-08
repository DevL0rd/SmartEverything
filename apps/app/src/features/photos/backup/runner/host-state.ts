import { prefOf, PREFS } from '../../../../store/prefs';
import type { StoreState } from '../../../../store/state';
import type { BackupDeviceIdentity } from '../model/types';

export interface BackupOwner {
  readonly clientId: string;
  readonly profileId: string;
  readonly identity: BackupDeviceIdentity;
}

export function backupOwner(
  state: StoreState,
  desktopDeviceId?: string | null,
): BackupOwner | null {
  const client = state.session?.client;
  if (!state.loaded || client?.profile_id === undefined || client.profile_id === null) return null;
  const pref = prefOf(state, PREFS.photosBackup);
  if (pref.status === 'invalid') return null;
  const device = state.tables.devices.rows.find((row) =>
    desktopDeviceId === undefined
      ? row.kind === 'phone' && row.details['clientId'] === client.id
      : row.kind === 'computer' && row.id === desktopDeviceId,
  );
  if (device === undefined) return null;
  return {
    clientId: client.id,
    profileId: client.profile_id,
    identity: {
      deviceId: device.id,
      name: device.name,
      platform: desktopDeviceId === undefined ? 'android' : 'desktop',
    },
  };
}

export function backupOwnerKey(state: StoreState, desktopDeviceId?: string | null): string | null {
  const owner = backupOwner(state, desktopDeviceId);
  return owner === null ? null : JSON.stringify(owner);
}
