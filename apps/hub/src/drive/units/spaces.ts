import type { DriveRoot, DriveRootScope } from '@smarteverything/domain';
import { storeUnit } from '../../store/host/unit';
import type { StoredDrive } from '../../store/repositories/drive-roots';
import type { HostStore } from '../../store/host/host-store';
import { DriveSpaceMissingError } from '../space-missing-error';

type SpacesStore = Pick<HostStore, 'driveRoots'>;

export function personalDrive(store: SpacesStore, profileId: string): StoredDrive {
  const drive = store.driveRoots.byIdentity('person', profileId);
  if (drive === undefined) throw new DriveSpaceMissingError('person', profileId);
  return drive;
}

export function sharedDrive(store: SpacesStore): StoredDrive {
  const drive = store.driveRoots.byIdentity('home', null);
  if (drive === undefined) throw new DriveSpaceMissingError('home', null);
  return drive;
}

export interface EnsureSpaceInput {
  readonly scope: DriveRootScope;
  readonly ownerProfileId: string | null;
  readonly draft: DriveRoot;
}

export const DRIVE_ENSURE_SPACE_UNIT = storeUnit((store, input: EnsureSpaceInput): StoredDrive =>
  store.write(
    () =>
      store.driveRoots.byIdentity(input.scope, input.ownerProfileId) ??
      store.driveRoots.insert(input.draft),
  ),
);
