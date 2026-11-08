import type { VacuumScene, VacuumSlot } from '@smarteverything/domain';
import type { VacuumScenesRepository } from '../store/repositories/vacuum-scenes';

export type MapStore = Pick<VacuumScenesRepository, 'save' | 'at' | 'latest' | 'has'>;

function keyOf(deviceId: string, slot: VacuumSlot): string {
  return `${deviceId}\u0000${slot}`;
}

export class MapCache {
  private readonly newest = new Map<string, VacuumScene>();
  private readonly robotMaps = new Map<string, Map<number, VacuumScene>>();

  constructor(private readonly store: MapStore) {}

  has(deviceId: string, slot: VacuumSlot, index: number): boolean {
    return (
      this.newest.get(keyOf(deviceId, slot))?.index === index ||
      this.store.has(deviceId, slot, index)
    );
  }

  at(deviceId: string, slot: VacuumSlot, index: number): VacuumScene | undefined {
    const newest = this.newest.get(keyOf(deviceId, slot));
    return newest?.index === index ? newest : this.store.at(deviceId, slot, index);
  }

  latest(deviceId: string, slot: VacuumSlot): VacuumScene | undefined {
    const key = keyOf(deviceId, slot);
    const held = this.newest.get(key);
    if (held !== undefined) return held;
    const stored = this.store.latest(deviceId, slot);
    if (stored !== undefined) this.newest.set(key, stored);
    return stored;
  }

  save(deviceId: string, scene: VacuumScene): void {
    this.store.save(deviceId, scene);
    const key = keyOf(deviceId, scene.slot);
    const held = this.latest(deviceId, scene.slot);
    if (held === undefined || scene.index >= held.index) this.newest.set(key, scene);
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
}
