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
  readonly resolvePhotoUploadTarget: Bound<typeof E.resolvePhotoUploadTarget>;
}

function validateRegistrationPlatform(store: Store, caller: Caller, input: BackupRegister): void {
  const device = store.devices.find(input.deviceId);
  const platform = device?.kind === 'computer' ? 'desktop' : clientOf(caller).platform;
  if (input.platform !== platform)
    throw new ApiError('invalid_request', 'The backup platform must match the paired device.');
}

export function photoBackupRoutes(store: Store, service: BackupService): PhotoBackupRoutes {
  const profileOf = (caller: Caller): string => profileIdOf(store, caller);
  const deviceOf = (caller: Caller, deviceId: string): string => {
    const profileId = profileOf(caller);
    const phone = store.devices.find(deviceId);
    const clientId = clientOf(caller).id;
    const phoneOwner =
      phone?.kind === 'phone' &&
      phone.details['clientId'] === clientId &&
      phone.details['profileId'] === profileId;
    const computerOwner =
      phone?.kind === 'computer' && store.computerNodes.ownsWindow(deviceId, clientId, profileId);
    if (!phoneOwner && !computerOwner) {
      throw new ApiError(
        'forbidden',
        'Backup requests must come from the paired phone or computer for this person.',
      );
    }
    return profileId;
  };
  return {
    registerBackupDevice: bound(E.registerBackupDevice, ({ body, caller }) => {
      const profileId = deviceOf(caller, body.deviceId);
      validateRegistrationPlatform(store, caller, body);
      return service.registerDevice(profileId, body);
    }),
    lookupPhotoBackupHashes: bound(E.lookupPhotoBackupHashes, ({ body, caller }) =>
      service.lookupHashes(deviceOf(caller, body.deviceId), body),
    ),
    checkBackupHashes: bound(E.checkBackupHashes, ({ body, caller }) =>
      service.checkHashes(deviceOf(caller, body.deviceId), body),
    ),
    readBackupState: bound(E.readBackupState, ({ caller }) => service.state(profileOf(caller))),
    resolvePhotoUploadTarget: bound(E.resolvePhotoUploadTarget, ({ body, caller }) =>
      body.kind === 'backup'
        ? service.backupTarget(deviceOf(caller, body.deviceId), body.deviceId)
        : service.manualTarget(profileOf(caller)),
    ),
  };
}
