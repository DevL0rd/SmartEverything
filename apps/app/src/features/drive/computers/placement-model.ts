import type { DriveItem, DrivePlacement, DrivePlacementSet } from '@smarteverything/domain';
import { compareText } from '../../../format/text';
import { driveLabelOf, type DriveRootPlace } from '../model/drive-access';
import { placementBodyOf, type SyncSettings } from '../model/placement-body';
import type { PickerChoice } from '../../files';
import { itemOf, type DriveOrigin } from '../source/drive-node';

export interface DriveNames {
  readonly roots: readonly DriveRootPlace[];
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

export function syncedOn(
  deviceId: string,
  placements: readonly DrivePlacement[],
): readonly DrivePlacement[] {
  return placementsOn(deviceId, placements).filter((placement) => placement.mode === 'synced');
}

export function mountOn(
  deviceId: string,
  placements: readonly DrivePlacement[],
  rootId: string | null,
): DrivePlacement | null {
  if (rootId === null) return null;
  return (
    placements.find(
      (placement) =>
        placement.deviceId === deviceId &&
        placement.mode === 'mounted' &&
        placement.rootId === rootId &&
        placement.folderItemId === null,
    ) ?? null
  );
}

class MountIsNotAFolderError extends Error {
  override readonly name = 'MountIsNotAFolderError';
  constructor(readonly placementId: string) {
    super('A mounted drive is turned on or off with its toggle, not changed like a synced folder.');
  }
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

export function syncSettingsOf(placement: DrivePlacement): SyncSettings | undefined {
  if (placement.mode !== 'synced') return undefined;
  return {
    excluded: placement.excluded ?? [],
    ignorePatterns: placement.ignorePatterns ?? [],
    conflictCopies: placement.conflictCopies ?? true,
  };
}

export function locationOf(placement: DrivePlacement): string | null {
  return placement.mode === 'synced' ? placement.localPath : null;
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
  if (sync === undefined || placement.localPath === null) {
    throw new MountIsNotAFolderError(placement.id);
  }
  return placementBodyOf({
    deviceId: placement.deviceId,
    target: { rootId: placement.rootId, folderItemId: placement.folderItemId },
    localPath: placement.localPath,
    enabled: change.enabled ?? placement.enabled,
    sync: { ...sync, ...change.sync },
  });
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
  picked: PickedFolder | null,
  localPath: string | null,
): DrivePlacementSet | null {
  if (picked === null || localPath === null) return null;
  return placementBodyOf({
    deviceId,
    target: { rootId: picked.rootId, folderItemId: picked.folderItemId },
    localPath,
  });
}
