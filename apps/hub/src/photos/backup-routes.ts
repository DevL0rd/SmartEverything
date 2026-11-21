import { ApiError, PHOTOS_ENDPOINTS, type BackupRegister } from '@smarteverything/domain';
import { clientOf, profileIdOf, type Caller } from '../server/auth';
import { bound, type Bound } from '../server/router';
import type { Store } from '../store/store';
import type { BackupService } from './backup';

const E = PHOTOS_ENDPOINTS;

export interface PhotoBackupRoutes {
  readonly registerBackupDevice: Bound<typeof E.registerBackupDevice>;
  readonly lookupPhotoBackupHashes: Bound<typeof E.lookupPhotoBackupHashes>;
  readonly checkBackupHashes: Bound<typeof E.checkBackupHashes>;
  readonly readBackupState: Bound<typeof E.readBackupState>;
  readonly readPhotoOrigins: Bound<typeof E.readPhotoOrigins>;
  readonly readFolderBackupCopies: Bound<typeof E.readFolderBackupCopies>;
  readonly resolvePhotoUploadTarget: Bound<typeof E.resolvePhotoUploadTarget>;
}

interface OwnedDevice {
  readonly profileId: string;
  readonly kind: string | null;
}

async function ownedDevice(store: Store, caller: Caller, deviceId: string): Promise<OwnedDevice> {
  const profileId = profileIdOf(caller);
  const device = await store.host.read('photoBackupDevice', {
    deviceId,
    clientId: clientOf(caller).id,
    profileId,
  });
  if (!device.owned) {
    throw new ApiError(
      'forbidden',
      'Backup requests must come from the paired phone or computer for this person.',
    );
  }
  return { profileId, kind: device.kind };
}

async function backupDeviceOwner(store: Store, caller: Caller, deviceId: string): Promise<string> {
  return (await ownedDevice(store, caller, deviceId)).profileId;
}

async function registrationOwner(
  store: Store,
  caller: Caller,
  input: BackupRegister,
): Promise<string> {
  const { profileId, kind } = await ownedDevice(store, caller, input.deviceId);
  const platform = kind === 'computer' ? 'desktop' : clientOf(caller).platform;
  if (input.platform !== platform)
    throw new ApiError('invalid_request', 'The backup platform must match the paired device.');
  return profileId;
}

export function photoBackupRoutes(store: Store, service: BackupService): PhotoBackupRoutes {
  const profileOf = (caller: Caller): string => profileIdOf(caller);
  const deviceOf = (caller: Caller, deviceId: string): Promise<string> =>
    backupDeviceOwner(store, caller, deviceId);
  return {
    registerBackupDevice: bound(E.registerBackupDevice, async ({ body, caller }) => {
      const profileId = await registrationOwner(store, caller, body);
      return await store.host.write('photoBackupRegister', { profileId, request: body });
    }),
    lookupPhotoBackupHashes: bound(E.lookupPhotoBackupHashes, async ({ body, caller }) =>
      store.host.read('photoBackupLookup', {
        profileId: await deviceOf(caller, body.deviceId),
        request: body,
      }),
    ),
    checkBackupHashes: bound(E.checkBackupHashes, async ({ body, caller }) =>
      store.host.write('photoBackupCheck', {
        profileId: await deviceOf(caller, body.deviceId),
        request: body,
      }),
    ),
    readBackupState: bound(E.readBackupState, ({ caller }) =>
      store.host.read('photoBackupState', { profileId: profileOf(caller) }),
    ),
    readPhotoOrigins: bound(E.readPhotoOrigins, async ({ body, caller }) =>
      store.host.read('photoBackupOrigins', {
        profileId: await deviceOf(caller, body.deviceId),
        request: body,
      }),
    ),
    readFolderBackupCopies: bound(E.readFolderBackupCopies, async ({ body, caller }) =>
      store.host.read('photoBackupCopies', {
        profileId: await deviceOf(caller, body.deviceId),
        request: body,
      }),
    ),
    resolvePhotoUploadTarget: bound(E.resolvePhotoUploadTarget, async ({ body, caller }) =>
      body.kind === 'backup'
        ? service.backupTarget(await deviceOf(caller, body.deviceId), body.deviceId)
        : service.manualTarget(profileOf(caller)),
    ),
  };
}
