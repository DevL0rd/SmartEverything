import type {
  DriveFolderPlace,
  DriveGrantRole,
  DriveItem,
  DriveRoot,
  DriveSharedWithMeEntry,
} from '@smarteverything/domain';
import type { FileLocation, FilePlace } from '../../files';
import {
  MY_DRIVE_LABEL,
  SHARED_DRIVE_LABEL,
  driveAccessOf,
  driveOfRootId,
  isDriveOwner,
  ownDriveOf,
  sharedDriveOf,
  type DriveAccess,
} from '../model/drive-access';

export const DRIVE_PLACES = {
  myDrive: 'my_drive',
  sharedDrive: 'shared_drive',
  sharedWithMe: 'shared_with_me',
  trash: 'trash',
} as const;

export type DrivePlaceKey = (typeof DRIVE_PLACES)[keyof typeof DRIVE_PLACES];

const SHARED_LABEL = 'Shared with me';

const TRASH_LABEL = 'Trash';

export interface DriveWorld {
  readonly roots: readonly DriveRoot[];
  readonly viewerId: string | null;
  readonly shared: readonly DriveSharedWithMeEntry[];
}

export function drivePlaceKeyOf(place: string): DrivePlaceKey | null {
  switch (place) {
    case DRIVE_PLACES.myDrive:
    case DRIVE_PLACES.sharedDrive:
    case DRIVE_PLACES.sharedWithMe:
    case DRIVE_PLACES.trash:
      return place;
    default:
      return null;
  }
}

export function drivePlacesOf(
  roots: readonly DriveRoot[],
  viewerId: string | null,
): readonly FilePlace[] {
  const mine = ownDriveOf(roots, viewerId);
  const home = sharedDriveOf(roots);
  return [
    ...(mine === null ? [] : [placeOf(DRIVE_PLACES.myDrive, MY_DRIVE_LABEL, 'my_drive')]),
    ...(home === null
      ? []
      : [placeOf(DRIVE_PLACES.sharedDrive, SHARED_DRIVE_LABEL, 'shared_drive')]),
    placeOf(DRIVE_PLACES.sharedWithMe, SHARED_LABEL, 'shared_with_me'),
    placeOf(DRIVE_PLACES.trash, TRASH_LABEL, 'trash'),
  ];
}

function placeOf(key: DrivePlaceKey, label: string, kind: FilePlace['kind']): FilePlace {
  return { key, label, kind, location: { place: key, folder: null } };
}

export function rootOfPlace(
  place: string,
  roots: readonly DriveRoot[],
  viewerId: string | null,
): DriveRoot | null {
  if (place === DRIVE_PLACES.myDrive) return ownDriveOf(roots, viewerId);
  return place === DRIVE_PLACES.sharedDrive ? sharedDriveOf(roots) : null;
}

export function folderPlaceOf(
  location: FileLocation,
  roots: readonly DriveRoot[],
  viewerId: string | null,
): DriveFolderPlace | null {
  if (location.folder !== null) return { kind: 'folder', folderId: location.folder };
  const root = rootOfPlace(location.place, roots, viewerId);
  return root === null ? null : { kind: 'drive', rootId: root.id };
}

type Placed = Pick<DriveItem, 'id' | 'rootId' | 'relPath'>;

function covers(top: Placed, item: Placed): boolean {
  return (
    top.rootId === item.rootId && (top.id === item.id || item.relPath.startsWith(`${top.relPath}/`))
  );
}

export function coverOf(
  shared: readonly DriveSharedWithMeEntry[],
  item: Placed,
): {
  readonly top: DriveItem;
  readonly role: DriveGrantRole;
  readonly grantedBy: string;
} | null {
  const covering = shared.filter((entry) => covers(entry.item, item));
  const [first, ...rest] = covering;
  if (first === undefined) return null;
  const top = rest.reduce(
    (best, entry) => (entry.item.relPath.length < best.item.relPath.length ? entry : best),
    first,
  );
  const role = covering.some((entry) => entry.grant.role === 'edit') ? 'edit' : 'view';
  return { top: top.item, role, grantedBy: top.grant.grantedBy };
}

export function accessOfItem(world: DriveWorld, item: Placed): DriveAccess {
  const root = driveOfRootId(world.roots, item.rootId);
  const cover = coverOf(world.shared, item);
  if (root === null) return cover?.role ?? 'none';
  return driveAccessOf(root, world.viewerId, cover?.role ?? null);
}

export function isForeignRoot(
  roots: readonly DriveRoot[],
  rootId: string,
  viewerId: string | null,
): boolean {
  const root = driveOfRootId(roots, rootId);
  return root === null || (root.scope === 'person' && !isDriveOwner(root, viewerId));
}
