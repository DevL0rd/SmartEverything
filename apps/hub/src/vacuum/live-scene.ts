import type { VacuumScene } from '@smarteverything/domain';
import { applyRoute, type Route } from '@smarteverything/xiaomi';
import type { MapCache } from './map-cache';

export interface LiveScenePorts {
  readonly cache: Pick<MapCache, 'latest' | 'save'>;
  readonly route: (deviceId: string) => Route | null;
}

export function withLiveRoute(
  scene: VacuumScene,
  live: Route | null,
  blobCursor: number,
): VacuumScene {
  return live === null || live.cursor < blobCursor ? scene : applyRoute(scene, live);
}

export class VacuumLiveScene {
  private readonly blobCursors = new Map<string, number>();

  constructor(private readonly ports: LiveScenePorts) {}

  blob(deviceId: string, route: Route | null): void {
    this.blobCursors.set(deviceId, route?.cursor ?? 0);
  }

  fetched(deviceId: string, scene: VacuumScene): VacuumScene {
    return scene.slot === 'current' ? this.merged(deviceId, scene) : scene;
  }

  routed(deviceId: string): VacuumScene | null {
    const scene = this.ports.cache.latest(deviceId, 'current');
    if (scene === undefined) return null;
    const merged = this.merged(deviceId, scene);
    return merged === scene ? null : merged;
  }

  private merged(deviceId: string, scene: VacuumScene): VacuumScene {
    const blobCursor = this.blobCursors.get(deviceId) ?? 0;
    const merged = withLiveRoute(scene, this.ports.route(deviceId), blobCursor);
    if (merged !== scene) this.ports.cache.save(deviceId, merged);
    return merged;
  }
}
