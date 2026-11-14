import type { DriveItem } from '../../../../../packages/domain/src/drive/item';
import type { DrivePlacement } from '../../../../../packages/domain/src/drive/placement';
import type { DriveRoot } from '../../../../../packages/domain/src/drive/root';
import type { BuiltRoot } from './items';
import type { People } from './plans';
import { cycle, HOUR_MS, iso, MINUTE_MS, NOW_MS } from './random';
import type { NonEmpty, Random } from './random';

interface RootTotals {
  readonly items: number;
  readonly folders: number;
  readonly bytes: number;
  readonly hashedShare: number;
  readonly verifiedShare: number;
  readonly corrupt: number;
}

function summarise(entry: BuiltRoot): RootTotals {
  const files = entry.items.filter((item) => item.kind !== 'folder');
  const share = (matching: number): number => (files.length === 0 ? 0 : matching / files.length);
  const hashed = files.filter((item) => 'sha256' in item && item.sha256 !== null).length;
  const verified = files.filter((item) => 'integrity' in item && item.integrity === 'ok').length;
  const corrupt = files.filter((item) => 'integrity' in item && item.integrity === 'corrupt');
  return {
    items: files.length,
    folders: entry.items.length - files.length,
    bytes: files.reduce((sum, item) => sum + item.bytes, 0),
    hashedShare: share(hashed),
    verifiedShare: share(verified),
    corrupt: corrupt.length,
  };
}

export function makeRoot(entry: BuiltRoot): DriveRoot {
  const { plan } = entry;
  const totals = summarise(entry);
  return {
    id: plan.id,
    scope: plan.scope,
    ownerProfileId: plan.owner,
    indexId: `idx-${plan.id.slice(0, 8)}`,
    state: plan.state,
    stateReason: plan.reason,
    items: totals.items,
    folders: totals.folders,
    bytes: totals.bytes,
    scannedAt: plan.state === 'scanning' ? null : iso(NOW_MS - 2 * HOUR_MS),
    health: {
      hashedShare: totals.hashedShare,
      verifiedShare: totals.verifiedShare,
      corrupt: totals.corrupt,
      lastScrubAt: iso(NOW_MS - 72 * HOUR_MS),
      lastBackupAt: iso(NOW_MS - 24 * HOUR_MS),
    },
    versions: plan.versions,
    skipPatterns: ['node_modules', '*.tmp'],
    includeHidden: false,
  };
}

function topFolder(items: readonly DriveItem[]): DriveItem | undefined {
  return items.find((item) => item.kind === 'folder' && item.parentId === null);
}

interface PlacementSlot {
  readonly index: number;
  readonly deviceId: string;
  readonly createdBy: string;
}

function statusFor(random: Random, index: number): DrivePlacement['status'] {
  const mounted = index === 2;
  return {
    state: mounted ? 'stopped' : 'up_to_date',
    tier: mounted ? null : 'full',
    basicLimits: null,
    readOnly: false,
    route: mounted ? null : 'local',
    cacheBytes: 0,
    pinnedBytes: 0,
    openFiles: 0,
    pendingUploads: 0,
    needBytes: index === 1 ? random.between(1_000_000, 900_000_000) : 0,
    lastSyncedAt: mounted ? null : iso(NOW_MS - (index === 0 ? 5 * MINUTE_MS : 2 * HOUR_MS)),
    errors:
      index === 1
        ? [{ relPath: null, message: 'The folder is not writable', at: iso(NOW_MS - HOUR_MS) }]
        : [],
    reason: null,
    reportedAt: iso(NOW_MS - MINUTE_MS),
  };
}

function placementFor(random: Random, entry: BuiltRoot, slot: PlacementSlot): DrivePlacement {
  const { index } = slot;
  const mounted = index === 2;
  const target = {
    id: random.uuid(),
    deviceId: slot.deviceId,
    rootId: entry.plan.id,
    folderItemId: (index === 1 ? topFolder(entry.items) : undefined)?.id ?? null,
    localPath: `/home/user/Drive ${String(index + 1)}`,
    enabled: !mounted,
    hold: null,
    createdBy: slot.createdBy,
    createdAt: iso(NOW_MS - (index + 1) * 24 * HOUR_MS),
    status: statusFor(random, index),
  };
  return mounted
    ? { ...target, mode: 'mounted' }
    : {
        ...target,
        mode: 'synced',
        excluded: index === 1 ? ['Documents 1'] : [],
        ignorePatterns: ['*.tmp', '.DS_Store'],
        conflictCopies: true,
      };
}

export function placementsFor(
  random: Random,
  entry: BuiltRoot,
  people: People,
  deviceIds: NonEmpty<string>,
): readonly DrivePlacement[] {
  return Array.from({ length: entry.plan.placements }, (_, index) =>
    placementFor(random, entry, {
      index,
      deviceId: cycle(deviceIds, index),
      createdBy: entry.plan.owner ?? cycle(people, index).id,
    }),
  );
}
