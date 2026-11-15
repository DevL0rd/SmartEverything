import type { ClientPrefRead, PhotosBackupPref } from '@smarteverything/domain';
import type { StoreState } from '../../../../store/state';
import type { BackupDeviceIdentity } from '../model/types';

export interface BackupOwner {
  readonly clientId: string;
  readonly profileId: string;
  readonly identity: BackupDeviceIdentity;
}

export function backupOwner(
  state: StoreState,
  pref: ClientPrefRead<PhotosBackupPref>,
  desktopDeviceId?: string | null,
): BackupOwner | null {
  const client = state.session?.client;
  if (!state.loaded || client?.profile_id === undefined || client.profile_id === null) return null;
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

export function backupOwnerKey(owner: BackupOwner | null): string | null {
  return owner === null ? null : JSON.stringify(owner);
}
