import {
  ApiError,
  DRIVE_PLACEMENT_STATUS,
  type DriveItem,
  type DrivePlacement,
  type DrivePlacementHold,
  type DrivePlacementSet,
  type DrivePlacementStatus,
} from '@smarteverything/domain';
import type { StoreContext } from '../store/context';
import type { DrivePlacementTarget } from '../store/repositories/drive-placements';
import type { Store } from '../store/store';
import { canRead, type DriveActor, type ItemAccess } from './access';
import { targetAccess, type PlacementAccessStore } from './placement-access';

export type PlacementStore = PlacementAccessStore & Pick<Store, 'drivePlacements'>;

export type DeviceChangeListener = (deviceIds: readonly string[]) => void;

export interface DrivePlacementsDeps {
  readonly store: PlacementStore;
  readonly context: StoreContext;
  readonly newId: () => string;
}

interface PlacementSpot {
  readonly rootId: string;
  readonly folderItemId: string | null;
}

interface SyncSettings {
  readonly excluded?: readonly string[] | undefined;
  readonly ignorePatterns?: readonly string[] | undefined;
  readonly conflictCopies?: boolean | undefined;
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
      placement.status.readOnly,
      placement.excluded ?? null,
      placement.ignorePatterns ?? null,
      placement.conflictCopies ?? null,
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
    const readOnly = this.verify(actor, input) === 'view';
    return this.mutate(input.deviceId, () => {
      const existing = this.deps.store.drivePlacements
        .forDevice(input.deviceId)
        .find((placement) => sameSpot(placement, input));
      this.refuseNesting(input, existing?.id ?? null);
      const settings = syncSettingsOf(input);
      const target = {
        mode: input.mode,
        localPath: input.localPath,
        enabled: input.enabled,
        ...settings,
      };
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

  setReadOnly(placementId: string, readOnly: boolean): DrivePlacement {
    const placement = this.deps.store.drivePlacements.byId(placementId);
    return this.mutate(placement.deviceId, () =>
      this.deps.store.drivePlacements.retarget(placementId, {
        mode: placement.mode,
        localPath: placement.localPath,
        enabled: placement.enabled,
        readOnly,
        ...syncSettingsOf(placement),
      }),
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
    return this.deps.store.computerNodes.personOf(deviceId) === actor.profileId;
  }

  private requireComputer(actor: DriveActor, deviceId: string): void {
    if (!this.mayManage(actor, deviceId)) throw noComputer();
  }

  private verify(actor: DriveActor, input: DrivePlacementSet): ItemAccess {
    const access = targetAccess(this.deps.store, actor, input);
    if (!canRead(access)) throw noFolder();
    if (input.folderItemId !== null) {
      const folder = this.deps.store.driveItems.find(input.folderItemId, null);
      if (folder?.kind !== 'folder') throw invalid('A placement needs a folder, not a file.');
    }
    for (const excluded of input.excluded ?? []) refuseExclusion(excluded);
    return access;
  }

  private refuseNesting(target: DrivePlacementSet, ownId: string | null): void {
    if (target.mode !== 'synced') return;
    const others = this.deps.store.drivePlacements
      .forDevice(target.deviceId)
      .filter(
        (placement) =>
          placement.rootId === target.rootId &&
          placement.id !== ownId &&
          placement.mode === 'synced',
      );
    for (const other of others) {
      if (this.nests(target, other)) {
        throw conflicting(
          `That folder and the synced folder at ${other.localPath} on this computer contain one another.`,
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
    let current: DriveItem | undefined = this.deps.store.driveItems.find(folderId, null);
    while (current !== undefined && !seen.has(current.id)) {
      seen.add(current.id);
      current =
        current.parentId === null
          ? undefined
          : this.deps.store.driveItems.find(current.parentId, null);
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
    reportedAt,
  };
}
