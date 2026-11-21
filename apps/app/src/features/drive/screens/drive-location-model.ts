import { href } from '../../../app-shell/hrefs';
import type { AppHref } from '../../../components/app-href';
import type { FileLocation } from '../../files';
import { driveOfRootId, isDriveOwner, type DriveRootPlace } from '../model/drive-access';
import type { DriveSection } from '../model/section-routes';
import { DRIVE_PLACES, drivePlaceKeyOf, type DrivePlaceKey } from '../source/drive-places';

const SECTION_OF_PLACE: Readonly<Record<DrivePlaceKey, DriveSection>> = {
  [DRIVE_PLACES.myDrive]: 'index',
  [DRIVE_PLACES.sharedDrive]: 'shared-drive',
  [DRIVE_PLACES.sharedWithMe]: 'shared',
  [DRIVE_PLACES.trash]: 'trash',
};

const TOP_HREF: Readonly<Record<DrivePlaceKey, AppHref>> = {
  [DRIVE_PLACES.myDrive]: href.drive(),
  [DRIVE_PLACES.sharedDrive]: href.drivePage('shared-drive'),
  [DRIVE_PLACES.sharedWithMe]: href.drivePage('shared'),
  [DRIVE_PLACES.trash]: href.drivePage('trash'),
};

class UnknownDrivePlaceError extends Error {
  override readonly name = 'UnknownDrivePlaceError';
}

function placeKeyOf(place: string): DrivePlaceKey {
  const key = drivePlaceKeyOf(place);
  if (key === null) throw new UnknownDrivePlaceError(`There is no Drive place ${place}.`);
  return key;
}

export function driveSectionOf(location: FileLocation): DriveSection {
  return SECTION_OF_PLACE[placeKeyOf(location.place)];
}

export function driveHrefOf(location: FileLocation): AppHref {
  const place = placeKeyOf(location.place);
  if (location.folder !== null && place !== DRIVE_PLACES.trash) {
    return href.driveFolder(location.folder);
  }
  return TOP_HREF[place];
}

export function placeOfRoot(
  roots: readonly DriveRootPlace[],
  rootId: string,
  viewerId: string | null,
): DrivePlaceKey {
  const root = driveOfRootId(roots, rootId);
  if (root === null) return DRIVE_PLACES.sharedWithMe;
  if (root.scope === 'home') return DRIVE_PLACES.sharedDrive;
  return isDriveOwner(root, viewerId) ? DRIVE_PLACES.myDrive : DRIVE_PLACES.sharedWithMe;
}

export function folderLocationOf(
  roots: readonly DriveRootPlace[],
  folder: { readonly id: string; readonly rootId: string },
  viewerId: string | null,
): FileLocation {
  return { place: placeOfRoot(roots, folder.rootId, viewerId), folder: folder.id };
}
