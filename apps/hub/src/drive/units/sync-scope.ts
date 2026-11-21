import { createHash } from 'node:crypto';
import { ApiError, type DrivePlacement } from '@smarteverything/domain';
import type { StoredDrive } from '../../store/repositories/drive-roots';
import { storeUnit } from '../../store/host/unit';
import type { HostStore } from '../../store/host/host-store';
import { canWrite } from '../access';
import { placementAccess, type PlacementAccessStore } from '../placement-access';
import type { SyncMode, SyncScope } from '../sync/placement-scope';
import { HOLD_REASONS } from './placement-reconcile';

export type ScopeStore = PlacementAccessStore & Pick<HostStore, 'drivePlacements'>;

const UUID_VERSION = 0x5000;
const UUID_VARIANT = 0x8000;
const NIBBLE_MASK = 0x0fff;
const VARIANT_MASK = 0x3fff;

function refusal(code: ApiError['code'], message: string): ApiError {
  return new ApiError(code, message);
}

function uuidOf(digest: string): string {
  const time = (Number.parseInt(digest.slice(12, 16), 16) & NIBBLE_MASK) | UUID_VERSION;
  const clock = (Number.parseInt(digest.slice(16, 20), 16) & VARIANT_MASK) | UUID_VARIANT;
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    time.toString(16),
    clock.toString(16),
    digest.slice(20, 32),
  ].join('-');
}

function indexIdOf(drive: StoredDrive, placement: DrivePlacement): string {
  const digest = createHash('sha256')
    .update(
      JSON.stringify([
        drive.indexId,
        placement.folderItemId,
        [...(placement.excluded ?? [])].sort(),
      ]),
    )
    .digest('hex');
  return uuidOf(digest);
}

function placementOf(store: ScopeStore, placementId: string, deviceId: string): DrivePlacement {
  const placement = store.drivePlacements.find(placementId);
  if (placement === undefined) {
    throw refusal('not_found', 'There is no such folder placement.');
  }
  if (placement.deviceId !== deviceId) {
    throw refusal('forbidden', 'That folder placement belongs to another computer.');
  }
  if (!placement.enabled) {
    throw refusal('forbidden', 'This folder placement is switched off.');
  }
  if (placement.hold !== null) {
    throw refusal('forbidden', HOLD_REASONS[placement.hold]);
  }
  return placement;
}

export function resolveScope(
  store: ScopeStore,
  placementId: string,
  deviceId: string,
  mode: SyncMode,
): SyncScope {
  const placement = placementOf(store, placementId, deviceId);
  if (mode === 'sync' && placement.mode !== 'synced') {
    throw refusal('invalid_request', 'This folder placement is mounted, not synced.');
  }
  const drive = store.driveRoots.find(placement.rootId);
  if (drive === undefined) throw refusal('not_found', 'This drive was removed.');
  const base =
    placement.folderItemId === null ? null : store.driveItems.find(placement.folderItemId, null);
  if (base === undefined) throw refusal('not_found', 'The placed folder is gone.');
  const access = placementAccess(store, placement);
  if (access === 'none') {
    throw refusal('forbidden', 'This person can no longer open the placed folder.');
  }
  return {
    placement,
    drive,
    base,
    excluded: placement.excluded ?? [],
    indexId: indexIdOf(drive, placement),
    writable: canWrite(access),
  };
}

export interface SyncScopeInput {
  readonly placementId: string;
  readonly deviceId: string;
  readonly mode: SyncMode;
}

export const DRIVE_SYNC_SCOPE_UNIT = storeUnit((store, input: SyncScopeInput) =>
  resolveScope(store, input.placementId, input.deviceId, input.mode),
);
