import type { VacuumScene, VacuumSlot } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { StoreHost } from '../store/host/host';

export interface MapStore {
  readonly save: (deviceId: string, scene: VacuumScene) => Promise<void>;
  readonly at: (
    deviceId: string,
    slot: VacuumSlot,
    index: number,
  ) => Promise<VacuumScene | undefined>;
}

export function hostMapStore(host: Pick<StoreHost, 'call'>): MapStore {
  return {
    save: (deviceId, scene) => host.call('vacuumScenes', 'save', deviceId, scene),
    at: (deviceId, slot, index) => host.call('vacuumScenes', 'at', deviceId, slot, index),
  };
}

export class MapCacheNotLoadedError extends Error {
  override readonly name = 'MapCacheNotLoadedError';

  constructor(deviceId: string) {
    super(`The vacuum maps of device ${deviceId} were read before they were loaded.`);
  }
}

function keyOf(deviceId: string, slot: VacuumSlot): string {
  return `${deviceId}\u0000${slot}`;
}

export class MapCache {
  private readonly newest = new Map<string, VacuumScene>();
  private readonly held = new Set<string>();
  private readonly robotMaps = new Map<string, Map<number, VacuumScene>>();

  constructor(private readonly store: MapStore) {}

  hold(deviceId: string, scenes: readonly VacuumScene[]): void {
    for (const scene of scenes) this.keepNewest(deviceId, scene);
    this.held.add(deviceId);
  }

  holdEmpty(deviceId: string): void {
    this.held.add(deviceId);
  }

  async at(deviceId: string, slot: VacuumSlot, index: number): Promise<VacuumScene | undefined> {
    const newest = this.newest.get(keyOf(deviceId, slot));
    return newest?.index === index ? newest : this.store.at(deviceId, slot, index);
  }

  latest(deviceId: string, slot: VacuumSlot): VacuumScene | undefined {
    if (!this.held.has(deviceId)) throw new MapCacheNotLoadedError(deviceId);
    return this.newest.get(keyOf(deviceId, slot));
  }

  save(deviceId: string, scene: VacuumScene): void {
    if (!this.held.has(deviceId)) throw new MapCacheNotLoadedError(deviceId);
    this.keepNewest(deviceId, scene);
    background(this.store.save(deviceId, scene), 'vacuum_map.save_failed', {
      deviceId,
      slot: scene.slot,
      index: scene.index,
    });
  }

  saveRobotMap(deviceId: string, scene: VacuumScene): void {
    if (scene.robotMapId === undefined) throw new Error('A saved robot map needs a robot map id.');
    const held = this.robotMaps.get(deviceId) ?? new Map<number, VacuumScene>();
    held.set(scene.robotMapId, scene);
    this.robotMaps.set(deviceId, held);
    if (scene.isCurrent === true) this.save(deviceId, scene);
  }

  robotMap(deviceId: string, robotMapId: number): VacuumScene | undefined {
    return this.robotMaps.get(deviceId)?.get(robotMapId);
  }

  dropRobotMap(deviceId: string, robotMapId: number): void {
    this.robotMaps.get(deviceId)?.delete(robotMapId);
  }

  private keepNewest(deviceId: string, scene: VacuumScene): void {
    const key = keyOf(deviceId, scene.slot);
    const held = this.newest.get(key);
    if (held === undefined || scene.index >= held.index) this.newest.set(key, scene);
  }
}
