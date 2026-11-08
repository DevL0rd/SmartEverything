import type { DriveRoot } from '../../../../../packages/domain/src/drive/root';
import type { DriveSyncClient } from '../../../../../packages/domain/src/drive/sync-client';
import type { BuiltRoot } from './items';
import type { People, RootPlan } from './plans';
import { cycle, HOUR_MS, iso, MINUTE_MS, NOW_MS } from './random';
import type { NonEmpty, Random } from './random';

const EXTERNAL_VOLUME = { mountId: 'sdb1', fsType: 'ext4', network: false } as const;
const SELECTED_FOLDER = 'Documents 1';

export function syncClientsFor(
  random: Random,
  plan: RootPlan,
  people: People,
  deviceIds: NonEmpty<string>,
): readonly DriveSyncClient[] {
  return Array.from({ length: plan.clients }, (_, index) => ({
    clientId: random.uuid(),
    rootId: plan.id,
    deviceId: cycle(deviceIds, index),
    profileId: plan.owner ?? cycle(people, index).id,
    enabled: index < 2,
    selected: index === 1 ? [SELECTED_FOLDER] : [],
    lastSeq: random.between(0, 5000),
    lastSeenAt: index < 2 ? iso(NOW_MS - (index === 0 ? 5 * MINUTE_MS : 2 * HOUR_MS)) : null,
    needBytes: index === 1 ? random.between(1_000_000, 900_000_000) : 0,
    errors:
      index === 1
        ? [{ relPath: null, message: 'The folder is not writable', at: iso(NOW_MS - HOUR_MS) }]
        : [],
  }));
}

interface RootTotals {
  readonly items: number;
  readonly folders: number;
  readonly bytes: number;
  readonly hashedShare: number;
  readonly verifiedShare: number;
  readonly corrupt: number;
}

type CommonFields = Pick<
  DriveRoot,
  | 'id'
  | 'label'
  | 'scope'
  | 'ownerProfileId'
  | 'indexId'
  | 'state'
  | 'stateReason'
  | 'items'
  | 'folders'
  | 'bytes'
  | 'scannedAt'
  | 'health'
  | 'inPhotos'
  | 'skipPatterns'
  | 'includeHidden'
>;

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

function commonFields(entry: BuiltRoot): CommonFields {
  const { plan } = entry;
  const totals = summarise(entry);
  const managed = plan.kind === 'managed';
  return {
    id: plan.id,
    label: plan.label,
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
      lastScrubAt: managed ? iso(NOW_MS - 72 * HOUR_MS) : null,
      lastBackupAt: managed ? iso(NOW_MS - 24 * HOUR_MS) : null,
    },
    inPhotos: plan.inPhotos,
    skipPatterns: ['node_modules', '*.tmp'],
    includeHidden: false,
  };
}

type PhysicalFields = CommonFields &
  Pick<Extract<DriveRoot, { readonly kind: 'folder' }>, 'path' | 'synced' | 'sync'>;

function physicalFields(
  plan: RootPlan,
  common: CommonFields,
  clients: readonly DriveSyncClient[],
): PhysicalFields {
  return {
    ...common,
    path: plan.path,
    synced: plan.synced,
    sync: {
      ignorePatterns: plan.synced ? ['*.tmp', '.DS_Store'] : [],
      conflictCopies: true,
      clients: clients.map((client) => ({ clientId: client.clientId, enabled: client.enabled })),
    },
  };
}

export function makeRoot(entry: BuiltRoot, clients: readonly DriveSyncClient[]): DriveRoot {
  const { plan } = entry;
  const common = commonFields(entry);
  const physical = physicalFields(plan, common, clients);
  switch (plan.kind) {
    case 'folder':
      return {
        ...physical,
        kind: 'folder',
        readOnly: plan.readOnly,
        versions: plan.versions,
        volume: null,
      };
    case 'volume':
      return {
        ...physical,
        kind: 'volume',
        readOnly: plan.readOnly,
        versions: plan.versions,
        volume: EXTERNAL_VOLUME,
      };
    case 'managed':
      return {
        ...physical,
        kind: 'managed',
        readOnly: false,
        versions: plan.versions,
        volume: null,
      };
    case 'cameras':
    case 'ai_images':
      return {
        ...common,
        kind: plan.kind,
        path: null,
        readOnly: true,
        versions: false,
        synced: false,
        sync: null,
      };
  }
}
