import type {
  DriveItem,
  DrivePlacement,
  DrivePlacementMode,
  DrivePlacementSet,
  DriveRoot,
} from '@smarteverything/domain';
import { compareText } from '../../../format/text';
import { driveLabelOf } from '../model/drive-access';
import { placementBodyOf, type SyncSettings } from '../model/placement-body';
import type { PickerChoice } from '../../files';
import { itemOf, type DriveOrigin } from '../source/drive-node';

export interface DriveNames {
  readonly roots: readonly DriveRoot[];
  readonly viewerId: string | null;
}

const UNKNOWN_DRIVE = 'A drive you cannot open';

export function placementsOn(
  deviceId: string,
  placements: readonly DrivePlacement[],
): readonly DrivePlacement[] {
  return placements
    .filter((placement) => placement.deviceId === deviceId)
    .slice()
    .sort((left, right) =>
      compareText(left.localPath ?? left.mountName ?? '', right.localPath ?? right.mountName ?? ''),
    );
}

export function drivePathOf(
  placement: Pick<DrivePlacement, 'rootId' | 'folderItemId'>,
  folder: Pick<DriveItem, 'name'> | null,
  names: DriveNames,
): string {
  const root = names.roots.find((candidate) => candidate.id === placement.rootId);
  const label = root === undefined ? null : driveLabelOf(root, names.viewerId);
  if (label !== null) return folder === null ? label : `${label} › ${folder.name}`;
  return folder === null ? UNKNOWN_DRIVE : `Shared with me › ${folder.name}`;
}

function separatorOf(path: string): '/' | '\\' {
  return path.includes('\\') && !path.includes('/') ? '\\' : '/';
}

export function childPath(parent: string, name: string): string {
  const separator = separatorOf(parent);
  const base = parent.endsWith(separator) ? parent.slice(0, -1) : parent;
  return `${base}${separator}${name}`;
}

export function parentPath(path: string): string {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  if (cut < 0) return path;
  const parent = path.slice(0, cut);
  return parent === '' || parent.endsWith(':') ? path.slice(0, cut + 1) : parent;
}

export function syncSettingsOf(placement: DrivePlacement): SyncSettings | undefined {
  if (placement.mode !== 'synced') return undefined;
  return {
    excluded: placement.excluded ?? [],
    ignorePatterns: placement.ignorePatterns ?? [],
    conflictCopies: placement.conflictCopies ?? true,
  };
}

export function locationOf(placement: DrivePlacement): string | null {
  return placement.mode === 'synced' ? placement.localPath : placement.status.mountPoint;
}

export interface PlacementChange {
  readonly enabled?: boolean;
  readonly sync?: Partial<SyncSettings>;
}

export function changedBodyOf(
  placement: DrivePlacement,
  change: PlacementChange,
): DrivePlacementSet {
  const sync = syncSettingsOf(placement);
  return placementBodyOf({
    deviceId: placement.deviceId,
    target: { rootId: placement.rootId, folderItemId: placement.folderItemId },
    mode: placement.mode,
    localPath: placement.localPath,
    mountName: placement.mountName,
    enabled: change.enabled ?? placement.enabled,
    ...(sync === undefined ? {} : { sync: { ...sync, ...change.sync } }),
  });
}

export function pausedBodiesOf(
  placements: readonly DrivePlacement[],
  enabled: boolean,
): readonly DrivePlacementSet[] {
  return placements
    .filter((placement) => placement.hold === null && placement.enabled !== enabled)
    .map((placement) => changedBodyOf(placement, { enabled }));
}

export interface PickedFolder {
  readonly rootId: string;
  readonly folderItemId: string | null;
  readonly name: string;
}

export function pickedFolderOf(
  choice: PickerChoice<DriveOrigin>,
  topRootId: (place: string) => string | null,
): PickedFolder | null {
  if (choice.kind !== 'folder') return null;
  const item = choice.folder === null ? null : itemOf(choice.folder);
  const rootId = item?.rootId ?? topRootId(choice.location.place);
  if (rootId === null) return null;
  return { rootId, folderItemId: choice.location.folder, name: choice.label };
}

export function sheetBodyOf(
  deviceId: string,
  mode: DrivePlacementMode,
  picked: PickedFolder | null,
  localPath: string | null,
): DrivePlacementSet | null {
  if (picked === null || (mode === 'synced' && localPath === null)) return null;
  return placementBodyOf({
    deviceId,
    target: { rootId: picked.rootId, folderItemId: picked.folderItemId },
    mode,
    localPath: mode === 'synced' ? localPath : null,
    mountName: mode === 'mounted' ? picked.name : null,
  });
}

export function mountPlaceOf(computer: string, picked: PickedFolder | null): string {
  return picked === null
    ? `Mounts where ${computer} keeps network drives`
    : `Mounts as ${picked.name} where ${computer} keeps network drives`;
}
