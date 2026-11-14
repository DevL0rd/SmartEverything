import type { DriveRoot } from '@smarteverything/domain';
import type { BadgeTone } from '../../../components/badge';
import type { IconName } from '../../../components/icon';
import { MY_DRIVE_LABEL, SHARED_DRIVE_LABEL, isDriveOwner } from './drive-access';

export const DRIVE_FILTERS = ['all', 'mine', 'shared-drive', 'with-me'] as const;

export type DriveFilter = (typeof DRIVE_FILTERS)[number];

export type DriveChipKey = Exclude<DriveFilter, 'all'>;

export interface DriveChip {
  readonly key: DriveChipKey;
  readonly label: string;
  readonly icon: IconName;
  readonly tone: BadgeTone;
}

export interface DriveFilterLook {
  readonly label: string;
  readonly icon: IconName;
}

export const DRIVE_FILTER_LOOK: Readonly<Record<DriveFilter, DriveFilterLook>> = {
  all: { label: 'All drives', icon: 'layers' },
  mine: { label: MY_DRIVE_LABEL, icon: 'hardDrive' },
  'shared-drive': { label: SHARED_DRIVE_LABEL, icon: 'users' },
  'with-me': { label: 'Shared with me', icon: 'share' },
};

const MY_DRIVE_CHIP: DriveChip = {
  key: 'mine',
  label: MY_DRIVE_LABEL,
  icon: 'hardDrive',
  tone: 'primary',
};

const SHARED_DRIVE_CHIP: DriveChip = {
  key: 'shared-drive',
  label: SHARED_DRIVE_LABEL,
  icon: 'users',
  tone: 'info',
};

export interface DriveChipInput {
  readonly roots: readonly Pick<DriveRoot, 'id' | 'scope' | 'ownerProfileId'>[];
  readonly viewerId: string | null;
  readonly sharerOfRoot: ReadonlyMap<string, string>;
  readonly names: ReadonlyMap<string, string>;
}

export type DriveChipOf = (rootId: string) => DriveChip;

function withMeChip(name: string | undefined): DriveChip {
  return {
    key: 'with-me',
    label: name ?? DRIVE_FILTER_LOOK['with-me'].label,
    icon: 'share',
    tone: 'neutral',
  };
}

export function driveChipsOf(input: DriveChipInput): DriveChipOf {
  const byId = new Map(input.roots.map((root) => [root.id, root]));
  return (rootId) => {
    const root = byId.get(rootId);
    if (root?.scope === 'home') return SHARED_DRIVE_CHIP;
    if (root !== undefined && isDriveOwner(root, input.viewerId)) return MY_DRIVE_CHIP;
    const owner = root?.ownerProfileId ?? input.sharerOfRoot.get(rootId) ?? null;
    return withMeChip(owner === null ? undefined : input.names.get(owner));
  };
}

export function driveFilterMatches(filter: DriveFilter, chip: DriveChip): boolean {
  return filter === 'all' || chip.key === filter;
}

export function drivePathOf(chip: DriveChip, relPath: string): string {
  if (chip.key === 'with-me') {
    return chip.label === DRIVE_FILTER_LOOK['with-me'].label
      ? chip.label
      : `Shared by ${chip.label}`;
  }
  return [chip.label, ...relPath.split('/').slice(0, -1)].join(' › ');
}

export function folderTrailOf(chip: DriveChip, relPath: string): string {
  if (chip.key === 'with-me') return '';
  return relPath.split('/').slice(0, -1).join(' › ');
}

export function inDrive<T>(
  entries: readonly T[],
  filter: DriveFilter,
  chipOf: (entry: T) => DriveChip,
): readonly T[] {
  if (filter === 'all') return entries;
  return entries.filter((entry) => chipOf(entry).key === filter);
}

export function driveFilterCounts<T>(
  entries: readonly T[],
  chipOf: (entry: T) => Pick<DriveChip, 'key'>,
): Readonly<Record<DriveFilter, number>> {
  const counted = { all: 0, mine: 0, 'shared-drive': 0, 'with-me': 0 };
  for (const entry of entries) {
    counted.all += 1;
    counted[chipOf(entry).key] += 1;
  }
  return counted;
}
