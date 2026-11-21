import {
  ApiError,
  DRIVE_MOUNT_NAME,
  DRIVE_PLACEMENT_STATUS,
  type DriveItem,
  type DriveMountSet,
  type DrivePlacement,
  type DrivePlacementHold,
  type DrivePlacementSet,
  type DrivePlacementStatus,
} from '@smarteverything/domain';
import type { DrivePlacementTarget } from '../../store/repositories/drive-placements';
import type { HostStore } from '../../store/host/host-store';
import { storeUnit } from '../../store/host/unit';
import { canRead, type DriveActor, type ItemAccess } from '../access';
import { targetAccess } from '../placement-access';
import { requireExport } from '../sharing/export-guard';

interface PlacementSpot {
  readonly rootId: string;
  readonly folderItemId: string | null;
}

interface SyncSettings {
  readonly excluded?: readonly string[] | undefined;
  readonly ignorePatterns?: readonly string[] | undefined;
  readonly conflictCopies?: boolean | undefined;
}

export type PlacementChange =
  | {
      readonly op: 'set';
      readonly actor: DriveActor;
      readonly input: DrivePlacementSet;
      readonly id: string;
    }
  | {
      readonly op: 'setMount';
      readonly actor: DriveActor;
      readonly input: DriveMountSet;
      readonly id: string;
    }
  | { readonly op: 'removeFor'; readonly actor: DriveActor; readonly placementId: string }
  | { readonly op: 'remove'; readonly placementId: string }
  | {
      readonly op: 'setHold';
      readonly placementId: string;
      readonly hold: DrivePlacementHold | null;
    }
  | { readonly op: 'repoint'; readonly placementId: string; readonly rootId: string }
  | { readonly op: 'setReadOnly'; readonly placementId: string; readonly readOnly: boolean }
  | {
      readonly op: 'writeStatus';
      readonly deviceId: string;
      readonly placementId: string;
      readonly status: DrivePlacementStatus;
    };

export interface PlacementChanged {
  readonly placement: DrivePlacement | null;
  readonly devices: readonly string[];
}

function noComputer(): ApiError {
  return new ApiError('not_found', 'There is no paired computer with that id for this person.');
}

function noFolder(): ApiError {
  return new ApiError('not_found', 'There is no such folder you can open on that computer.');
}

function conflicting(message: string): ApiError {
  return new ApiError('conflict', message);
}

function invalid(message: string): ApiError {
  return new ApiError('invalid_request', message);
}

function signatureOf(placements: readonly DrivePlacement[]): string {
  return JSON.stringify(
    placements.map((placement) => [
      placement.id,
      placement.rootId,
      placement.folderItemId,
      placement.mode,
      placement.localPath,
      placement.mountName,
      placement.status.readOnly,
      placement.excluded ?? null,
      placement.ignorePatterns ?? null,
      placement.conflictCopies ?? null,
    ]),
  );
}

export function isActive(placement: DrivePlacement): boolean {
  return placement.enabled && placement.hold === null;
}

function sameSpot(placement: DrivePlacement, target: PlacementSpot): boolean {
  return placement.rootId === target.rootId && placement.folderItemId === target.folderItemId;
}

function syncSettingsOf(
  input: SyncSettings,
): Pick<DrivePlacementTarget, 'excluded' | 'ignorePatterns' | 'conflictCopies'> {
  const settings: {
    excluded?: readonly string[];
    ignorePatterns?: readonly string[];
    conflictCopies?: boolean;
  } = {};
  if (input.excluded !== undefined) settings.excluded = input.excluded;
  if (input.ignorePatterns !== undefined) settings.ignorePatterns = input.ignorePatterns;
  if (input.conflictCopies !== undefined) settings.conflictCopies = input.conflictCopies;
  return settings;
}

function refuseExclusion(path: string): void {
  const segments = path.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw invalid(`An excluded folder is a path inside the placed folder, not "${path}".`);
  }
}

function startingStatus(reportedAt: string, readOnly: boolean): DrivePlacementStatus {
  return {
    state: 'starting',
    tier: null,
    basicLimits: null,
    readOnly,
    route: null,
    cacheBytes: 0,
    pinnedBytes: 0,
    openFiles: 0,
    pendingUploads: 0,
    needBytes: 0,
    lastSyncedAt: null,
    errors: [],
    reason: null,
    mountPoint: null,
    reportedAt,
  };
}

export function mayManage(store: HostStore, actor: DriveActor, deviceId: string): boolean {
  return store.computerNodes.personOf(deviceId) === actor.profileId;
}

export class PlacementRules {
  private readonly touched = new Map<string, string>();

  constructor(private readonly store: HostStore) {}

  private activeFor(deviceId: string): readonly DrivePlacement[] {
    return this.store.drivePlacements.forDevice(deviceId).filter(isActive);
  }

  private mutate<T>(deviceId: string, work: () => T): T {
    if (!this.touched.has(deviceId)) {
      this.touched.set(deviceId, signatureOf(this.activeFor(deviceId)));
    }
    return work();
  }

  changedDevices(): string[] {
    return [...this.touched]
      .filter(([deviceId, before]) => signatureOf(this.activeFor(deviceId)) !== before)
      .map(([deviceId]) => deviceId);
  }

  private requireComputer(actor: DriveActor, deviceId: string): void {
    if (!mayManage(this.store, actor, deviceId)) throw noComputer();
  }

  private verify(actor: DriveActor, input: DrivePlacementSet): ItemAccess {
    const access = targetAccess(this.store, actor, input);
    if (!canRead(access)) throw noFolder();
    if (input.folderItemId !== null) {
      const folder = this.store.driveItems.find(input.folderItemId, null);
      if (folder?.kind !== 'folder') throw invalid('A placement needs a folder, not a file.');
      requireExport(access, folder);
    }
    for (const excluded of input.excluded) refuseExclusion(excluded);
    return access;
  }

  set(actor: DriveActor, input: DrivePlacementSet, id: string): DrivePlacement {
    this.requireComputer(actor, input.deviceId);
    const readOnly = this.verify(actor, input) === 'view';
    return this.mutate(input.deviceId, () => {
      const existing = this.store.drivePlacements
        .forDevice(input.deviceId)
        .find((placement) => placement.mode === 'synced' && sameSpot(placement, input));
      this.refuseNesting(input, existing?.id ?? null);
      const target = {
        mode: 'synced',
        localPath: input.localPath,
        mountName: null,
        enabled: input.enabled,
        ...syncSettingsOf(input),
      } as const;
      if (existing !== undefined) {
        return this.store.drivePlacements.retarget(existing.id, { ...target, readOnly });
      }
      return this.store.drivePlacements.insert({
        id,
        deviceId: input.deviceId,
        rootId: input.rootId,
        folderItemId: input.folderItemId,
        createdBy: actor.profileId,
        status: startingStatus(this.store.context.now(), readOnly),
        ...target,
      });
    });
  }

  setMount(actor: DriveActor, input: DriveMountSet, id: string): DrivePlacement {
    this.requireComputer(actor, input.deviceId);
    const drive = this.store.driveRoots.byIdentity('person', actor.profileId);
    if (drive === undefined) throw new ApiError('not_found', 'You have no My Drive to mount yet.');
    const spot = { rootId: drive.id, folderItemId: null };
    const readOnly = targetAccess(this.store, actor, spot) === 'view';
    return this.mutate(input.deviceId, () => {
      const existing = this.mountOn(input.deviceId, spot);
      const target = {
        mode: 'mounted',
        localPath: null,
        mountName: DRIVE_MOUNT_NAME,
        enabled: input.enabled,
      } as const;
      if (existing !== undefined) {
        return this.store.drivePlacements.retarget(existing.id, { ...target, readOnly });
      }
      return this.store.drivePlacements.insert({
        id,
        deviceId: input.deviceId,
        ...spot,
        createdBy: actor.profileId,
        status: startingStatus(this.store.context.now(), readOnly),
        ...target,
      });
    });
  }

  removeFor(actor: DriveActor, placementId: string): void {
    const placement = this.store.drivePlacements.find(placementId);
    if (placement === undefined || !mayManage(this.store, actor, placement.deviceId)) {
      throw noComputer();
    }
    this.mutate(placement.deviceId, () => {
      this.store.drivePlacements.remove(placementId);
    });
  }

  remove(placementId: string): void {
    const placement = this.store.drivePlacements.byId(placementId);
    this.mutate(placement.deviceId, () => {
      this.store.drivePlacements.remove(placementId);
    });
  }

  setHold(placementId: string, hold: DrivePlacementHold | null): DrivePlacement {
    const placement = this.store.drivePlacements.byId(placementId);
    return this.mutate(placement.deviceId, () =>
      this.store.drivePlacements.setHold(placementId, hold),
    );
  }

  repoint(placementId: string, rootId: string): DrivePlacement {
    const before = this.store.drivePlacements.byId(placementId);
    return this.mutate(before.deviceId, () => {
      this.store.context.sql.run(
        'point the placement at the drive its folder moved to',
        'update drive_placements set root_id = $rootId where id = $id',
        { id: placementId, rootId },
      );
      const after = this.store.drivePlacements.byId(placementId);
      this.store.context.changed('drive_placements', 'UPDATE', after, before);
      return after;
    });
  }

  setReadOnly(placementId: string, readOnly: boolean): DrivePlacement {
    const placement = this.store.drivePlacements.byId(placementId);
    return this.mutate(placement.deviceId, () =>
      this.store.drivePlacements.retarget(placementId, {
        mode: placement.mode,
        localPath: placement.localPath,
        mountName: placement.mountName,
        enabled: placement.enabled,
        readOnly,
        ...syncSettingsOf(placement),
      }),
    );
  }

  writeStatus(deviceId: string, placementId: string, status: DrivePlacementStatus): DrivePlacement {
    const placement = this.store.drivePlacements.find(placementId);
    if (placement === undefined)
      throw new ApiError('not_found', 'There is no such folder placement.');
    if (placement.deviceId !== deviceId) {
      throw new ApiError('forbidden', 'That folder placement belongs to another computer.');
    }
    return this.store.drivePlacements.writeStatus(
      placementId,
      DRIVE_PLACEMENT_STATUS.parse(status),
    );
  }

  private mountOn(deviceId: string, spot: PlacementSpot): DrivePlacement | undefined {
    const mounts = this.store.drivePlacements
      .forDevice(deviceId)
      .filter((placement) => placement.mode === 'mounted');
    const stray = mounts.find((placement) => !sameSpot(placement, spot));
    if (stray !== undefined) {
      throw conflicting('This computer has a mounted drive that is not your My Drive.');
    }
    return mounts[0];
  }

  private refuseNesting(target: DrivePlacementSet, ownId: string | null): void {
    const others = this.store.drivePlacements
      .forDevice(target.deviceId)
      .filter(
        (placement) =>
          placement.rootId === target.rootId &&
          placement.id !== ownId &&
          placement.mode === 'synced',
      );
    for (const other of others) {
      if (this.nests(target, other)) {
        const where = other.localPath === null ? '' : ` at ${other.localPath}`;
        throw conflicting(
          `That folder and the synced folder${where} on this computer contain one another.`,
        );
      }
    }
  }

  private nests(target: PlacementSpot, other: DrivePlacement): boolean {
    if (target.folderItemId === null || other.folderItemId === null) return true;
    return (
      this.lineage(target.folderItemId).has(other.folderItemId) ||
      this.lineage(other.folderItemId).has(target.folderItemId)
    );
  }

  private lineage(folderId: string): ReadonlySet<string> {
    const seen = new Set<string>();
    let current: DriveItem | undefined = this.store.driveItems.find(folderId, null);
    while (current !== undefined && !seen.has(current.id)) {
      seen.add(current.id);
      current =
        current.parentId === null ? undefined : this.store.driveItems.find(current.parentId, null);
    }
    return seen;
  }

  apply(change: PlacementChange): DrivePlacement | null {
    switch (change.op) {
      case 'set':
        return this.set(change.actor, change.input, change.id);
      case 'setMount':
        return this.setMount(change.actor, change.input, change.id);
      case 'removeFor':
        this.removeFor(change.actor, change.placementId);
        return null;
      case 'remove':
        this.remove(change.placementId);
        return null;
      case 'setHold':
        return this.setHold(change.placementId, change.hold);
      case 'repoint':
        return this.repoint(change.placementId, change.rootId);
      case 'setReadOnly':
        return this.setReadOnly(change.placementId, change.readOnly);
      case 'writeStatus':
        return this.writeStatus(change.deviceId, change.placementId, change.status);
    }
  }
}

export function placementChangeIn(
  store: HostStore,
  changes: readonly PlacementChange[],
): { readonly placements: (DrivePlacement | null)[]; readonly devices: string[] } {
  const rules = new PlacementRules(store);
  const placements = changes.map((change) => rules.apply(change));
  return { placements, devices: rules.changedDevices() };
}

export const DRIVE_PLACEMENT_CHANGE_UNIT = storeUnit((store, changes: readonly PlacementChange[]) =>
  placementChangeIn(store, changes),
);

export const DRIVE_PLACEMENT_LIST_UNIT = storeUnit((store, actor: DriveActor) =>
  store.drivePlacements.list().filter((placement) => mayManage(store, actor, placement.deviceId)),
);
