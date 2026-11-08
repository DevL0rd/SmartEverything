import { describe, expect, it } from 'vitest';
import {
  CAPABILITY_KEY,
  type DeviceEvent,
  type JsonValue,
  type VacuumScene,
} from '@smarteverything/domain';
import { cleanMapOf, cleanTrackerOf } from '../../src/vacuum/assemble';
import { MapCache, type MapStore } from '../../src/vacuum/map-cache';
import { captureLogs, testLogger } from '../support/logs';
import { BASE, ROBOT, ROBOT_ID, STATUS, resting, sceneOf } from './clean-bench';

function storeOf(): MapStore {
  const scenes = new Map<string, VacuumScene>();
  return {
    save: (deviceId, scene): void => {
      scenes.set(`${deviceId}|${String(scene.index)}`, scene);
    },
    at: (deviceId, _slot, index) => scenes.get(`${deviceId}|${String(index)}`),
    latest: () => [...scenes.values()].at(-1),
    has: (deviceId, _slot, index) => scenes.has(`${deviceId}|${String(index)}`),
  };
}

describe('vacuum clean tracker assembly', () => {
  it('reads the map facts from the cache and the task id from the given source', () => {
    captureLogs();
    const cache = new MapCache(storeOf());
    const map = cleanMapOf(cache, () => 42);
    expect(map(ROBOT_ID)).toStrictEqual({ taskId: 42, index: null, rooms: new Map(), trail: [] });
    cache.save(ROBOT_ID, sceneOf(9));
    expect(map(ROBOT_ID)).toMatchObject({ taskId: 42, index: 9 });
  });

  it('builds a tracker that opens and closes a clean through the state and event writers', () => {
    captureLogs();
    const bench = resting();
    const recorded: DeviceEvent[] = [];
    const saved: string[] = [];
    const tracker = cleanTrackerOf(
      {
        store: { devices: { find: (id: string) => (id === ROBOT_ID ? ROBOT : undefined) } },
        cleans: {
          save: (_deviceId, clean): void => {
            saved.push(clean.outcome ?? 'open');
          },
          get: () => undefined,
          open: () => undefined,
          rename: (): void => undefined,
        },
        map: () => ({ taskId: null, index: null, rooms: new Map(), trail: [] }),
        now: () => new Date(BASE),
        log: testLogger('vacuum-clean'),
      },
      () => ({
        state: {
          valueOf: (deviceId, key): JsonValue | undefined => bench.values.get(`${deviceId}|${key}`),
        },
        events: {
          fromProvider: (_provider, event): void => {
            recorded.push(event);
          },
        },
      }),
    );
    const change = (value: number, previous: number): void => {
      bench.seed(STATUS, value);
      tracker.observe({
        deviceId: ROBOT_ID,
        capability: CAPABILITY_KEY.parse(STATUS),
        value,
        previous,
      });
    };
    change(4, 2);
    change(15, 4);
    expect(saved).toStrictEqual(['open', 'error']);
    expect(recorded.map((event) => event.kind)).toStrictEqual(['activity', 'cycle_finished']);
    expect(recorded[0]?.details['name']).toBe('clean_started');
  });
});
