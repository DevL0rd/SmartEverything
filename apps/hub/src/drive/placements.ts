import type {
  DriveMountSet,
  DrivePlacement,
  DrivePlacementHold,
  DrivePlacementSet,
  DrivePlacementStatus,
} from '@smarteverything/domain';
import type { Store } from '../store/store';
import type { DriveActor } from './access';
import { isActive, type PlacementChange } from './units/placements';

export type PlacementStore = Pick<Store, 'host'>;

export type DeviceChangeListener = (deviceIds: readonly string[]) => void;

export interface DrivePlacementsDeps {
  readonly store: PlacementStore;
  readonly newId: () => string;
}

export class DrivePlacementsResultError extends Error {
  override readonly name = 'DrivePlacementsResultError';

  constructor(readonly op: PlacementChange['op']) {
    super(`The placement change ${op} returned no placement.`);
  }
}

export class DrivePlacements {
  private readonly listeners = new Set<DeviceChangeListener>();

  constructor(private readonly deps: DrivePlacementsDeps) {}

  onDeviceChanged(listener: DeviceChangeListener): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  changed(devices: readonly string[]): void {
    if (devices.length === 0) return;
    for (const listener of this.listeners) listener(devices);
  }

  list(actor: DriveActor): Promise<DrivePlacement[]> {
    return this.deps.store.host.read('drivePlacementList', actor);
  }

  async activeFor(deviceId: string): Promise<DrivePlacement[]> {
    const placements = await this.deps.store.host.call('drivePlacements', 'forDevice', deviceId);
    return placements.filter(isActive);
  }

  private async change(change: PlacementChange): Promise<DrivePlacement | null> {
    const result = await this.deps.store.host.write('drivePlacementChange', [change]);
    this.changed(result.devices);
    const [placement] = result.placements;
    if (placement === undefined) throw new DrivePlacementsResultError(change.op);
    return placement;
  }

  private async placed(change: PlacementChange): Promise<DrivePlacement> {
    const placement = await this.change(change);
    if (placement === null) throw new DrivePlacementsResultError(change.op);
    return placement;
  }

  set(actor: DriveActor, input: DrivePlacementSet): Promise<DrivePlacement> {
    return this.placed({ op: 'set', actor, input, id: this.deps.newId() });
  }

  setMount(actor: DriveActor, input: DriveMountSet): Promise<DrivePlacement> {
    return this.placed({ op: 'setMount', actor, input, id: this.deps.newId() });
  }

  async removeFor(actor: DriveActor, placementId: string): Promise<void> {
    await this.change({ op: 'removeFor', actor, placementId });
  }

  async remove(placementId: string): Promise<void> {
    await this.change({ op: 'remove', placementId });
  }

  setHold(placementId: string, hold: DrivePlacementHold | null): Promise<DrivePlacement> {
    return this.placed({ op: 'setHold', placementId, hold });
  }

  repoint(placementId: string, rootId: string): Promise<DrivePlacement> {
    return this.placed({ op: 'repoint', placementId, rootId });
  }

  setReadOnly(placementId: string, readOnly: boolean): Promise<DrivePlacement> {
    return this.placed({ op: 'setReadOnly', placementId, readOnly });
  }

  writeStatus(
    deviceId: string,
    placementId: string,
    status: DrivePlacementStatus,
  ): Promise<DrivePlacement> {
    return this.placed({ op: 'writeStatus', deviceId, placementId, status });
  }
}
