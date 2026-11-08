import {
  ApiError,
  DRIVE_PLACEMENT_STATUS,
  type DriveItem,
  type DriveRoot,
  type DrivePlacement,
  type DrivePlacementHold,
  type DrivePlacementSet,
  type DrivePlacementStatus,
} from '@smarteverything/domain';
import type { StoreContext } from '../store/context';
import type { Store } from '../store/store';
import { rootVisibleTo, type DriveActor } from './service-read';

export type PlacementStore = Pick<
  Store,
  'drivePlacements' | 'driveRoots' | 'driveItems' | 'computerNodes'
>;

export type DeviceChangeListener = (deviceIds: readonly string[]) => void;

export interface DrivePlacementsDeps {
  readonly store: PlacementStore;
  readonly context: StoreContext;
  readonly nodeActor: (deviceId: string) => DriveActor;
  readonly newId: () => string;
}

interface PlacementTarget {
  readonly rootId: string;
  readonly folderItemId: string | null;
}

function noComputer(): ApiError {
  return new ApiError('not_found', 'There is no paired computer with that id for this person.');
}

function noFolder(): ApiError {
  return new ApiError('not_found', 'There is no such library folder on that computer.');
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
    ]),
  );
}

export class DrivePlacements {
  private readonly listeners = new Set<DeviceChangeListener>();
  private readonly touched = new Map<string, string>();

  constructor(private readonly deps: DrivePlacementsDeps) {}

  onDeviceChanged(listener: DeviceChangeListener): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  list(actor: DriveActor): readonly DrivePlacement[] {
    return this.deps.store.drivePlacements
      .list()
      .filter((placement) => this.mayManage(actor, placement.deviceId));
  }

  activeFor(deviceId: string): readonly DrivePlacement[] {
    return this.deps.store.drivePlacements.forDevice(deviceId).filter(isActive);
  }

  set(actor: DriveActor, input: DrivePlacementSet): DrivePlacement {
    this.requireComputer(actor, input.deviceId);
    const root = this.visibleRoot(input);
    const readOnly = root.readOnly;
    return this.mutate(input.deviceId, () => {
      this.verify(root, input);
      const existing = this.deps.store.drivePlacements
        .forDevice(input.deviceId)
        .find((placement) => sameTarget(placement, input));
      this.refuseOverlap(input, existing?.id ?? null);
      const target = { mode: input.mode, localPath: input.localPath, enabled: input.enabled };
      if (existing !== undefined) {
        return this.deps.store.drivePlacements.retarget(existing.id, { ...target, readOnly });
      }
      return this.deps.store.drivePlacements.insert({
        id: this.deps.newId(),
        deviceId: input.deviceId,
        rootId: input.rootId,
        folderItemId: input.folderItemId,
        createdBy: actor.profileId,
        status: startingStatus(this.at(), readOnly),
        ...target,
      });
    });
  }

  removeFor(actor: DriveActor, placementId: string): void {
    const placement = this.deps.store.drivePlacements.find(placementId);
    if (placement === undefined || !this.mayManage(actor, placement.deviceId)) throw noComputer();
    this.mutate(placement.deviceId, () => {
      this.deps.store.drivePlacements.remove(placementId);
    });
  }

  remove(placementId: string): void {
    const placement = this.deps.store.drivePlacements.byId(placementId);
    this.mutate(placement.deviceId, () => {
      this.deps.store.drivePlacements.remove(placementId);
    });
  }

  setHold(placementId: string, hold: DrivePlacementHold | null): DrivePlacement {
    const placement = this.deps.store.drivePlacements.byId(placementId);
    return this.mutate(placement.deviceId, () =>
      this.deps.store.drivePlacements.setHold(placementId, hold),
    );
  }

  writeStatus(deviceId: string, placementId: string, status: DrivePlacementStatus): DrivePlacement {
    const placement = this.deps.store.drivePlacements.find(placementId);
    if (placement === undefined)
      throw new ApiError('not_found', 'There is no such folder placement.');
    if (placement.deviceId !== deviceId) {
      throw new ApiError('forbidden', 'That folder placement belongs to another computer.');
    }
    return this.deps.store.drivePlacements.writeStatus(
      placementId,
      DRIVE_PLACEMENT_STATUS.parse(status),
    );
  }

  private at(): string {
    return this.deps.context.now();
  }

  private mayManage(actor: DriveActor, deviceId: string): boolean {
    if (actor.owner) return true;
    return this.deps.store.computerNodes.personOf(deviceId) === actor.profileId;
  }

  private requireComputer(actor: DriveActor, deviceId: string): void {
    if (this.deps.store.computerNodes.personOf(deviceId) === null) throw noComputer();
    if (!this.mayManage(actor, deviceId)) throw noComputer();
  }

  private visibleRoot(input: DrivePlacementSet): DriveRoot {
    const root = this.deps.store.driveRoots.find(input.rootId);
    if (root === undefined) throw noFolder();
    if (!rootVisibleTo(this.deps.nodeActor(input.deviceId), root)) throw noFolder();
    return root;
  }

  private verify(root: DriveRoot, input: DrivePlacementSet): void {
    if (input.mode === 'synced' && !root.synced) {
      throw invalid('Sync is off for this library folder, so it cannot be placed as synced.');
    }
    if (input.folderItemId === null) return;
    const folder = this.deps.store.driveItems.find(input.folderItemId);
    if (folder?.rootId !== input.rootId) throw noFolder();
    if (folder.kind !== 'folder') throw invalid('A placement needs a folder, not a file.');
  }

  private refuseOverlap(target: DrivePlacementSet, ownId: string | null): void {
    const others = this.deps.store.drivePlacements
      .forDevice(target.deviceId)
      .filter((placement) => placement.rootId === target.rootId && placement.id !== ownId);
    for (const other of others) {
      if (this.overlaps(target, other)) {
        throw conflicting(
          'That folder and a folder already placed on this computer contain one another.',
        );
      }
    }
  }

  private overlaps(target: PlacementTarget, other: DrivePlacement): boolean {
    if (target.folderItemId === null || other.folderItemId === null) return true;
    return (
      this.lineage(target.folderItemId).has(other.folderItemId) ||
      this.lineage(other.folderItemId).has(target.folderItemId)
    );
  }

  private lineage(folderId: string): ReadonlySet<string> {
    const seen = new Set<string>();
    let current: DriveItem | undefined = this.deps.store.driveItems.find(folderId);
    while (current !== undefined && !seen.has(current.id)) {
      seen.add(current.id);
      current =
        current.parentId === null ? undefined : this.deps.store.driveItems.find(current.parentId);
    }
    return seen;
  }

  private mutate<T>(deviceId: string, work: () => T): T {
    return this.deps.context.write(() => {
      if (!this.deps.context.sql.inTransaction()) this.touched.clear();
      if (!this.touched.has(deviceId)) this.touched.set(deviceId, this.signature(deviceId));
      this.deps.context.afterCommit(() => {
        this.flush();
      });
      return work();
    });
  }

  private signature(deviceId: string): string {
    return signatureOf(this.activeFor(deviceId));
  }

  private flush(): void {
    const changed = [...this.touched]
      .filter(([deviceId, before]) => this.signature(deviceId) !== before)
      .map(([deviceId]) => deviceId);
    this.touched.clear();
    if (changed.length === 0) return;
    for (const listener of this.listeners) listener(changed);
  }
}

function isActive(placement: DrivePlacement): boolean {
  return placement.enabled && placement.hold === null;
}

function sameTarget(placement: DrivePlacement, target: PlacementTarget): boolean {
  return placement.rootId === target.rootId && placement.folderItemId === target.folderItemId;
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
    reason: null,
    reportedAt,
  };
}
