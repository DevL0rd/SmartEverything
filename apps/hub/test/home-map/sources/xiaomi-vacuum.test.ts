import {
  VACUUM_MAP_KEY,
  VACUUM_SAVED_MAPS_KEY,
  vacuumSavedMapVersion,
  vacuumSceneToSourceGeometry,
  vacuumSceneVersion,
  type CapabilityKey,
  type JsonValue,
  type VacuumScene,
} from '@smarteverything/domain';
import { pv11glCatalog } from '@smarteverything/xiaomi';
import { beforeEach, describe, expect, it } from 'vitest';
import { MapSourceRegistry, type MapSourceChange } from '../../../src/home-map/sources/registry';
import {
  XiaomiVacuumSource,
  type RobotMapChange,
} from '../../../src/home-map/sources/xiaomi-vacuum';
import { vacuumPropertyKey } from '../../../src/vacuum/capabilities';
import { captureLogs, testLogger, type CapturedLogs } from '../../support/logs';
import { fixtureScene } from '../scene-fixtures';

const ROBOT = 'robot';
const OTHER = 'other';
const CLEANING = 4;
const CHARGING = 2;
const STATUS = vacuumPropertyKey('status');

let logs: CapturedLogs;
let values: Map<string, JsonValue>;
let scenes: Map<string, VacuumScene>;
let saved: Map<number, VacuumScene>;
let source: XiaomiVacuumSource;
let changes: MapSourceChange[];
let mapChanges: RobotMapChange[];

const keyOf = (deviceId: string, key: CapabilityKey): string => `${deviceId}\u0000${key}`;

const setStatus = (deviceId: string, status: number): void => {
  values.set(keyOf(deviceId, STATUS), status);
};

const publish = (deviceId: string, scene: VacuumScene): void => {
  scenes.set(deviceId, scene);
  values.set(keyOf(deviceId, VACUUM_MAP_KEY), vacuumSceneVersion(scene));
  source.published(deviceId, scene);
};

const later = (index: number): VacuumScene => ({ ...fixtureScene, index });

beforeEach(() => {
  logs = captureLogs();
  values = new Map();
  scenes = new Map();
  saved = new Map();
  changes = [];
  mapChanges = [];
  source = new XiaomiVacuumSource({
    scene: (deviceId): VacuumScene | undefined => scenes.get(deviceId),
    robotMap: (_deviceId, robotMapId): VacuumScene | undefined => saved.get(robotMapId),
    value: (deviceId, key): JsonValue | undefined => values.get(keyOf(deviceId, key)),
    log: testLogger('home-map-source'),
  });
  source.onChange(ROBOT, (change) => changes.push(change));
  source.onMapChange(ROBOT, (change) => mapChanges.push(change));
});

const mapScene = (robotMapId: number, index: number, slot: 'current' | 'saved'): VacuumScene => ({
  ...fixtureScene,
  index,
  slot,
  robotMapId,
  robotMapName: `Map ${String(robotMapId)}`,
});

const list = (...entries: { scene: VacuumScene; isCurrent: boolean }[]): void => {
  for (const { scene } of entries) {
    if (scene.robotMapId !== undefined && scene.slot === 'saved')
      saved.set(scene.robotMapId, scene);
  }
  values.set(
    keyOf(ROBOT, VACUUM_SAVED_MAPS_KEY),
    JSON.stringify(
      entries.map(({ scene, isCurrent }) => ({
        robotMapId: scene.robotMapId ?? 0,
        name: scene.robotMapName ?? '',
        isCurrent,
        rooms: scene.rooms.length,
        version: vacuumSavedMapVersion({ index: scene.index, robotMapId: scene.robotMapId ?? 0 }),
      })),
    ),
  );
  source.savedMapsChanged(ROBOT);
};

describe('reading the vacuum map', () => {
  it('reads nothing while no map version is published', () => {
    scenes.set(ROBOT, fixtureScene);
    expect(source.read(ROBOT)).toBeNull();
  });

  it('reads nothing when the stored scene is not the published version', () => {
    values.set(keyOf(ROBOT, VACUUM_MAP_KEY), vacuumSceneVersion(later(7)));
    scenes.set(ROBOT, fixtureScene);
    expect(source.read(ROBOT)).toBeNull();
  });

  it('reads the published scene as a source geometry', () => {
    setStatus(ROBOT, CHARGING);
    publish(ROBOT, fixtureScene);
    expect(source.read(ROBOT)).toEqual(vacuumSceneToSourceGeometry(fixtureScene));
  });
});

describe('settled maps only', () => {
  it('imports a push at once while the robot is docked', () => {
    setStatus(ROBOT, CHARGING);
    publish(ROBOT, fixtureScene);
    expect(changes).toEqual([{ deviceId: ROBOT, version: vacuumSceneVersion(fixtureScene) }]);
  });

  it('produces no import for a push in the middle of a run', () => {
    setStatus(ROBOT, CLEANING);
    publish(ROBOT, later(1));
    publish(ROBOT, later(2));
    publish(ROBOT, later(3));
    expect(changes).toEqual([]);
    expect(logs.events().filter((event) => event === 'home_map.source_pending')).toHaveLength(3);
  });

  it('imports the pending push once when the cycle finishes', () => {
    setStatus(ROBOT, CLEANING);
    publish(ROBOT, later(1));
    publish(ROBOT, later(2));
    setStatus(ROBOT, CHARGING);
    source.cycleFinished(ROBOT);
    source.statusChanged(ROBOT);
    source.cycleFinished(ROBOT);
    expect(changes).toEqual([{ deviceId: ROBOT, version: vacuumSceneVersion(later(2)) }]);
  });

  it('imports the pending push once when the robot settles without a finish event', () => {
    setStatus(ROBOT, CLEANING);
    publish(ROBOT, later(1));
    source.statusChanged(ROBOT);
    expect(changes).toEqual([]);
    setStatus(ROBOT, CHARGING);
    source.statusChanged(ROBOT);
    source.statusChanged(ROBOT);
    expect(changes).toHaveLength(1);
  });

  it('imports nothing on a status change when no push is pending', () => {
    setStatus(ROBOT, CLEANING);
    source.statusChanged(ROBOT);
    setStatus(ROBOT, CHARGING);
    source.statusChanged(ROBOT);
    source.cycleFinished(ROBOT);
    expect(changes).toEqual([]);
  });

  it('does not treat a robot with an unknown status as settled', () => {
    publish(ROBOT, fixtureScene);
    expect(source.isSettled(ROBOT)).toBe(false);
    expect(changes).toEqual([]);
  });

  it('ignores the saved and backup map slots', () => {
    setStatus(ROBOT, CHARGING);
    source.published(ROBOT, { ...fixtureScene, slot: 'saved' });
    source.published(ROBOT, { ...fixtureScene, slot: 'backup' });
    expect(changes).toEqual([]);
  });
});

describe('one map per robot map', () => {
  const first = mapScene(1, 10, 'saved');
  const second = mapScene(2, 11, 'saved');

  it('lists the robot maps from the published summary and tolerates an unreadable one', () => {
    list({ scene: first, isCurrent: true }, { scene: second, isCurrent: false });
    expect(source.robotMaps(ROBOT)).toEqual([
      { robotMapId: 1, name: 'Map 1', isCurrent: true },
      { robotMapId: 2, name: 'Map 2', isCurrent: false },
    ]);
    values.set(keyOf(ROBOT, VACUUM_SAVED_MAPS_KEY), '{broken');
    expect(source.robotMaps(ROBOT)).toEqual([]);
    expect(logs.events()).toContain('home_map.saved_maps_unreadable');
  });

  it('reads a saved robot map under its own version, whatever the robot is doing', () => {
    setStatus(ROBOT, CLEANING);
    list(
      { scene: mapScene(1, 10, 'current'), isCurrent: true },
      { scene: second, isCurrent: false },
    );
    expect(source.readMap(ROBOT, 2)?.version).toBe(
      vacuumSavedMapVersion({ index: 11, robotMapId: 2 }),
    );
    expect(source.readMap(ROBOT, 99)).toBeNull();
  });

  it('reads the current robot map from the current scene only once the robot is settled', () => {
    const current = mapScene(1, 12, 'current');
    setStatus(ROBOT, CLEANING);
    scenes.set(ROBOT, current);
    values.set(keyOf(ROBOT, VACUUM_MAP_KEY), vacuumSceneVersion(current));
    list({ scene: current, isCurrent: true });
    saved.set(1, mapScene(1, 10, 'saved'));
    expect(source.readMap(ROBOT, 1)).toBeNull();
    setStatus(ROBOT, CHARGING);
    expect(source.readMap(ROBOT, 1)?.version).toBe(vacuumSceneVersion(current));
  });

  it('tells at once about a changed saved map that is not the current one, even mid-clean', () => {
    setStatus(ROBOT, CLEANING);
    list(
      { scene: mapScene(1, 10, 'current'), isCurrent: true },
      { scene: second, isCurrent: false },
    );
    expect(mapChanges.map((change) => change.robotMapId)).toEqual([2]);
    list(
      { scene: mapScene(1, 10, 'current'), isCurrent: true },
      { scene: mapScene(2, 13, 'saved'), isCurrent: false },
    );
    expect(mapChanges.map((change) => [change.robotMapId, change.version])).toEqual([
      [2, vacuumSavedMapVersion({ index: 11, robotMapId: 2 })],
      [2, vacuumSavedMapVersion({ index: 13, robotMapId: 2 })],
    ]);
  });

  it('holds a change of the current robot map mid-clean and tells once when the cycle ends', () => {
    const current = mapScene(1, 12, 'current');
    setStatus(ROBOT, CLEANING);
    publish(ROBOT, current);
    list({ scene: mapScene(1, 14, 'saved'), isCurrent: true });
    expect(mapChanges).toEqual([]);
    expect(changes).toEqual([]);
    setStatus(ROBOT, CHARGING);
    source.cycleFinished(ROBOT);
    source.cycleFinished(ROBOT);
    expect(mapChanges).toEqual([
      { deviceId: ROBOT, robotMapId: 1, version: vacuumSceneVersion(current) },
    ]);
  });

  it('tells a settled current push by the robot map id it carries', () => {
    setStatus(ROBOT, CHARGING);
    publish(ROBOT, mapScene(3, 20, 'current'));
    expect(mapChanges).toEqual([{ deviceId: ROBOT, robotMapId: 3, version: '20:current' }]);
  });

  it('knows the identity of the current robot map and nothing without one', () => {
    expect(source.currentMap(ROBOT)).toBeNull();
    setStatus(ROBOT, CHARGING);
    list({ scene: first, isCurrent: false }, { scene: second, isCurrent: true });
    expect(source.currentMap(ROBOT)).toEqual({ robotMapId: 2, name: 'Map 2' });
  });

  it('stops telling after the unsubscribe and forgets everything of a removed robot', () => {
    const others: RobotMapChange[] = [];
    const stop = source.onMapChange(ROBOT, (change) => others.push(change));
    setStatus(ROBOT, CHARGING);
    list({ scene: second, isCurrent: false });
    stop();
    list({ scene: mapScene(2, 15, 'saved'), isCurrent: false });
    expect(others).toHaveLength(1);
    source.detach(ROBOT);
    list({ scene: mapScene(2, 16, 'saved'), isCurrent: false });
    expect(mapChanges).toHaveLength(2);
  });
});

describe('listeners', () => {
  it('tells only the listeners of that robot and stops after unsubscribe', () => {
    const others: MapSourceChange[] = [];
    source.onChange(OTHER, (change) => others.push(change));
    const stopped: MapSourceChange[] = [];
    const stop = source.onChange(ROBOT, (change) => stopped.push(change));
    setStatus(ROBOT, CHARGING);
    publish(ROBOT, later(1));
    stop();
    publish(ROBOT, later(2));
    expect(others).toEqual([]);
    expect(stopped.map((change) => change.version)).toEqual([vacuumSceneVersion(later(1))]);
    expect(changes.map((change) => change.version)).toEqual([
      vacuumSceneVersion(later(1)),
      vacuumSceneVersion(later(2)),
    ]);
  });

  it('keeps telling the others when one listener throws and logs it', () => {
    source.onChange(ROBOT, () => {
      throw new Error('boom');
    });
    setStatus(ROBOT, CHARGING);
    publish(ROBOT, later(1));
    expect(changes).toHaveLength(1);
    expect(logs.events()).toContain('home_map.source_listener_failed');
  });

  it('forgets a pending push and the listeners of a removed robot', () => {
    setStatus(ROBOT, CLEANING);
    publish(ROBOT, later(1));
    source.detach(ROBOT);
    setStatus(ROBOT, CHARGING);
    source.cycleFinished(ROBOT);
    expect(changes).toEqual([]);
  });
});

describe('the registry entry', () => {
  it('finds only Xiaomi vacuum devices in the inventory', () => {
    const registry = new MapSourceRegistry([source]);
    const { model } = pv11glCatalog();
    const found = registry.candidates([
      { id: 'v1', provider: 'xiaomi', model },
      { id: 'v2', provider: 'tuya', model },
      { id: 'v3', provider: 'xiaomi', model: 'xiaomi.light.x' },
    ]);
    expect(found.map((candidate) => candidate.deviceId)).toEqual(['v1']);
    expect(registry.get('xiaomi_vacuum')?.capabilities.livePose).toBe(true);
  });
});
