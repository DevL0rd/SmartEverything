import type {
  DriveFolderPlace,
  DriveGrantRole,
  DriveItem,
  DriveRoot,
  DriveSharedWithMeEntry,
} from '@smarteverything/domain';
import {
  MY_DRIVE_LABEL,
  SHARED_DRIVE_LABEL,
  canWrite,
  driveAccessOf,
  driveOfRootId,
  sharedItemLabel,
  type DriveAccess,
} from '../model/drive-access';
import type { DriveSection } from '../model/section-routes';

export type PlaceKind = 'mine' | 'home' | 'with-me';

export interface SharedCover {
  readonly top: DriveItem;
  readonly role: DriveGrantRole;
  readonly sharerId: string;
}

export interface BrowsePlace {
  readonly kind: PlaceKind;
  readonly rootId: string;
  readonly root: DriveRoot | null;
  readonly access: DriveAccess;
  readonly topLabel: string;
  readonly cover: SharedCover | null;
}

export type CrumbTarget =
  | { readonly kind: 'top' }
  | { readonly kind: 'shared' }
  | { readonly kind: 'folder'; readonly id: string };

export interface CrumbSpec {
  readonly key: string;
  readonly label: string;
  readonly target: CrumbTarget | null;
}

type Placed = Pick<DriveItem, 'id' | 'rootId' | 'relPath'>;

function covers(top: Placed, item: Placed): boolean {
  return (
    top.rootId === item.rootId && (top.id === item.id || item.relPath.startsWith(`${top.relPath}/`))
  );
}

export function sharedCoverOf(
  entries: readonly DriveSharedWithMeEntry[],
  item: Placed,
): SharedCover | null {
  const covering = entries.filter((entry) => covers(entry.item, item));
  const [first, ...rest] = covering;
  if (first === undefined) return null;
  const top = rest.reduce(
    (best, entry) => (entry.item.relPath.length < best.item.relPath.length ? entry : best),
    first,
  );
  const role = covering.some((entry) => entry.grant.role === 'edit') ? 'edit' : 'view';
  return { top: top.item, role, sharerId: top.grant.grantedBy };
}

export interface PlaceInput {
  readonly roots: readonly DriveRoot[];
  readonly viewerId: string | null;
  readonly rootId: string;
  readonly folder: DriveItem | null;
  readonly cover: SharedCover | null;
  readonly nameOf: (profileId: string) => string | null;
}

function drivePlace(root: DriveRoot, viewerId: string | null): BrowsePlace | null {
  const access = driveAccessOf(root, viewerId, null);
  if (access !== 'own' && access !== 'shared') return null;
  const home = root.scope === 'home';
  return {
    kind: home ? 'home' : 'mine',
    rootId: root.id,
    root,
    access,
    topLabel: home ? SHARED_DRIVE_LABEL : MY_DRIVE_LABEL,
    cover: null,
  };
}

export function browsePlaceOf(input: PlaceInput): BrowsePlace | null {
  const { roots, viewerId, rootId, folder, cover } = input;
  const root = driveOfRootId(roots, rootId);
  const owned = root === null ? null : drivePlace(root, viewerId);
  if (owned !== null) return owned;
  if (folder === null || cover === null) return null;
  const sharer = input.nameOf(cover.sharerId) ?? 'Someone';
  return {
    kind: 'with-me',
    rootId,
    root: null,
    access: cover.role,
    topLabel: sharedItemLabel(sharer, cover.top),
    cover,
  };
}

export function placeSectionOf(kind: PlaceKind): DriveSection {
  switch (kind) {
    case 'mine':
      return 'index';
    case 'home':
      return 'shared-drive';
    case 'with-me':
      return 'shared';
  }
}

export function placeWritable(place: BrowsePlace, online: boolean): boolean {
  return online && canWrite(place.access);
}

function innerCrumbs(folder: DriveItem, basePath: string | null): readonly CrumbSpec[] {
  const relative = basePath === null ? folder.relPath : folder.relPath.slice(basePath.length + 1);
  const parts = relative.split('/');
  const prefix = basePath === null ? '' : `${basePath}/`;
  return parts.slice(0, -1).map((label, index) => ({
    key: `${prefix}${parts.slice(0, index + 1).join('/')}`,
    label,
    target:
      index === parts.length - 2 && folder.parentId !== null
        ? { kind: 'folder', id: folder.parentId }
        : null,
  }));
}

function sharedCrumbs(cover: SharedCover, label: string, folder: DriveItem): readonly CrumbSpec[] {
  const atTop = cover.top.id === folder.id;
  return [
    { key: 'shared', label: 'Shared with me', target: { kind: 'shared' } },
    {
      key: 'cover',
      label,
      target: atTop ? null : { kind: 'folder', id: cover.top.id },
    },
    ...(atTop ? [] : innerCrumbs(folder, cover.top.relPath)),
  ];
}

export function crumbsOf(place: BrowsePlace, folder: DriveItem | null): readonly CrumbSpec[] {
  if (place.cover !== null && folder !== null) {
    return sharedCrumbs(place.cover, place.topLabel, folder);
  }
  const top: CrumbSpec = {
    key: 'top',
    label: place.topLabel,
    target: folder === null ? null : { kind: 'top' },
  };
  return folder === null ? [top] : [top, ...innerCrumbs(folder, null)];
}

export function titleOf(place: BrowsePlace, folder: DriveItem | null): string {
  return folder?.name ?? place.topLabel;
}

export function writeTargetOf(
  place: BrowsePlace,
  folder: DriveItem | null,
): DriveFolderPlace | null {
  if (folder !== null) return { kind: 'folder', folderId: folder.id };
  return place.root === null ? null : { kind: 'drive', rootId: place.root.id };
}
