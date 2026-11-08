import type { VacuumScene, VacuumSlot } from '@smarteverything/domain';
import type { Route, RouteMode, RoutePoint } from '@smarteverything/xiaomi';
import { beforeEach, describe, expect, it } from 'vitest';
import { MapCache, type MapStore } from '../../src/vacuum/map-cache';
import { VacuumLiveScene } from '../../src/vacuum/live-scene';
import { ROBOT_ID, sceneOf } from './clean-bench';

function point(poseId: number, mode: RouteMode): RoutePoint {
  return { poseId, x: 1000 + poseId * 100, y: -500, yaw: 1500, penDown: true, mode };
}

function routeOf(sweeps: number, mops: number): Route {
  const points = [
    ...Array.from({ length: sweeps }, (_, index) => point(index, 'sweep')),
    ...Array.from({ length: mops }, (_, index) => point(sweeps + index, 'mop')),
  ];
  return { cursor: points.length, points };
}

class MemoryScenes implements MapStore {
  readonly rows = new Map<string, VacuumScene>();

  save(deviceId: string, scene: VacuumScene): void {
    this.rows.set(`${deviceId}|${scene.slot}|${String(scene.index)}`, scene);
  }

  at(deviceId: string, slot: VacuumSlot, index: number): VacuumScene | undefined {
    return this.rows.get(`${deviceId}|${slot}|${String(index)}`);
  }

  latest(deviceId: string, slot: VacuumSlot): VacuumScene | undefined {
    return [...this.rows.values()]
      .filter((scene) => scene.slot === slot && this.at(deviceId, slot, scene.index) === scene)
      .sort((a, b) => b.index - a.index)[0];
  }

  has(deviceId: string, slot: VacuumSlot, index: number): boolean {
    return this.at(deviceId, slot, index) !== undefined;
  }
}

let scenes: MemoryScenes;
let cache: MapCache;
let live: Route | null;
let merger: VacuumLiveScene;

beforeEach(() => {
  scenes = new MemoryScenes();
  cache = new MapCache(scenes);
  live = null;
  merger = new VacuumLiveScene({ cache, route: (): Route | null => live });
});

describe('the live trail of the current map', () => {
  it('grows the stored trail from the live route with the mop run apart and moves the robot', () => {
    cache.save(ROBOT_ID, sceneOf(5));
    live = routeOf(4, 3);
    const merged = merger.routed(ROBOT_ID);
    expect(merged?.trail.map((run) => [run.mopping, run.points.length])).toStrictEqual([
      [false, 4],
      [true, 4],
    ]);
    expect(merged?.robot).toStrictEqual({ x: 1.6, y: -0.5, yaw: 1.5 });
    expect(scenes.at(ROBOT_ID, 'current', 5)?.trail).toStrictEqual(merged?.trail);
  });

  it('changes nothing without a current map or without live points', () => {
    live = routeOf(3, 0);
    expect(merger.routed(ROBOT_ID)).toBeNull();
    cache.save(ROBOT_ID, sceneOf(5));
    live = null;
    expect(merger.routed(ROBOT_ID)).toBeNull();
  });

  it('keeps the trail of the map blob while the live route is behind its path', () => {
    const blob = sceneOf(6, [
      {
        mopping: false,
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ],
      },
    ]);
    merger.blob(ROBOT_ID, routeOf(40, 1));
    live = routeOf(10, 0);
    expect(merger.fetched(ROBOT_ID, blob)).toBe(blob);
    cache.save(ROBOT_ID, blob);
    expect(merger.routed(ROBOT_ID)).toBeNull();
  });

  it('puts the live route on a newly fetched map whose blob has no path for the task', () => {
    merger.blob(ROBOT_ID, null);
    live = routeOf(5, 0);
    const shown = merger.fetched(ROBOT_ID, sceneOf(7));
    expect(shown.trail).toHaveLength(1);
    expect(shown.trail[0]?.points).toHaveLength(5);
    expect(cache.latest(ROBOT_ID, 'current')).toBe(shown);
  });
});
