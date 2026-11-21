import {
  VACUUM_MAP_KEY,
  VACUUM_SAVED_MAPS_KEY,
  vacuumSceneVersion,
  type CapabilityKey,
  type JsonValue,
  type VacuumScene,
} from '@smarteverything/domain';
import { pv11glCatalog } from '@smarteverything/xiaomi';
import { beforeEach, describe, expect, it } from 'vitest';
import { HomeMapAutoCreate } from '../../src/home-map/auto-create';
import type { HomeMapService } from '../../src/home-map/service';
import { MapSourceRegistry } from '../../src/home-map/sources/registry';
import {
  XiaomiVacuumSource,
  type RobotMapIdentity,
} from '../../src/home-map/sources/xiaomi-vacuum';
import type { StoredRoomLink } from '../../src/store/repositories/vacuum-room-links';
import { vacuumPropertyKey } from '../../src/vacuum/capabilities';
import { captureLogs, testLogger, type CapturedLogs } from '../support/logs';
import { DEVICE, NOW } from './import-fixtures';
import { mapHarness, type MapHarness } from './feed-fixtures';
import { rectRing, syntheticScene } from './scene-fixtures';
import { HOME_DEN, HOME_HALL, storedLink } from './store-fixtures';

const OTHER = '9c3e2f50-4d6b-4e8c-8fb0-2b3c4d5e6f70';
const CLEANING = 4;
const CHARGING = 2;
const STATUS = vacuumPropertyKey('status');
const MODEL = pv11glCatalog().model;

let logs: CapturedLogs;
let harness: MapHarness;
let service: HomeMapService;
let source: XiaomiVacuumSource;
let values: Map<string, JsonValue>;
let scenes: Map<string, VacuumScene>;
let links: StoredRoomLink[];
let counter: number;
let autoCreate: HomeMapAutoCreate;

const keyOf = (deviceId: string, key: CapabilityKey): string => `${deviceId}\u0000${key}`;

const inventory = (...ids: string[]): { id: string; provider: 'xiaomi'; model: string }[] =>
  ids.map((id) => ({ id, provider: 'xiaomi', model: MODEL }));

const setStatus = (deviceId: string, status: number): void => {
  values.set(keyOf(deviceId, STATUS), status);
};

const publish = async (deviceId: string, scene: VacuumScene): Promise<void> => {
  scenes.set(deviceId, scene);
  values.set(keyOf(deviceId, VACUUM_MAP_KEY), vacuumSceneVersion(scene));
  source.published(deviceId, scene);
  await service.settled();
};

beforeEach(async () => {
  logs = captureLogs();
  values = new Map();
  scenes = new Map();
  links = [];
  counter = 0;
  harness = await mapHarness();
  service = harness.service;
  source = new XiaomiVacuumSource({
    scene: (deviceId): VacuumScene | undefined => scenes.get(deviceId),
    robotMap: (): VacuumScene | undefined => undefined,
    value: (deviceId, key): JsonValue | undefined => values.get(keyOf(deviceId, key)),
    log: testLogger('home-map-source'),
  });
  autoCreate = new HomeMapAutoCreate({
    registry: new MapSourceRegistry([source]),
    maps: service,
    currentMap: (deviceId): RobotMapIdentity | null => source.currentMap(deviceId),
    links: { list: (): Promise<StoredRoomLink[]> => Promise.resolve(links) },
    newId: (): string => `auto-${String((counter += 1))}`,
    now: (): string => NOW,
    log: testLogger('home-map'),
  });
});

describe('creating the map from the first settled robot map', () => {
  it('creates the whole map in one revision made by the robot source', async () => {
    setStatus(DEVICE, CHARGING);
    await publish(DEVICE, syntheticScene);
    await autoCreate.watch(inventory(DEVICE));
    const map = service.get();
    expect(map.revision).toBe(1);
    expect(map.sources.map((entry) => [entry.kind, entry.deviceId])).toEqual([
      ['xiaomi_vacuum', DEVICE],
    ]);
    expect(map.floors).toHaveLength(1);
    expect(map.floors[0]?.rooms.map((room) => room.name)).toEqual(['Hall', 'Den']);
    expect((await service.revisions()).map((entry) => entry.actor)).toEqual([
      `source:${map.sources[0]?.id ?? ''}`,
    ]);
    expect(logs.events()).toContain('home_map.auto_created');
  });

  it('creates it when the robot settles after the watch began, from the settled event', async () => {
    await autoCreate.watch(inventory(DEVICE));
    setStatus(DEVICE, CHARGING);
    await publish(DEVICE, syntheticScene);
    expect(service.get().revision).toBe(1);
  });

  it('creates nothing while no map version is published', async () => {
    setStatus(DEVICE, CHARGING);
    scenes.set(DEVICE, syntheticScene);
    await autoCreate.watch(inventory(DEVICE));
    expect(service.get().revision).toBe(0);
    expect(await autoCreate.consider({ source, deviceId: DEVICE })).toBe('no_published_map');
  });

  it('creates nothing for a push in the middle of a run and creates once when the cycle ends', async () => {
    setStatus(DEVICE, CLEANING);
    await autoCreate.watch(inventory(DEVICE));
    await publish(DEVICE, syntheticScene);
    await publish(DEVICE, { ...syntheticScene, index: 8 });
    expect(service.get().revision).toBe(0);
    setStatus(DEVICE, CHARGING);
    source.cycleFinished(DEVICE);
    source.cycleFinished(DEVICE);
    await service.settled();
    expect(service.get().revision).toBe(1);
    expect(logs.events().filter((event) => event === 'home_map.auto_created')).toHaveLength(1);
  });

  it('creates nothing from a scene without rooms', async () => {
    setStatus(DEVICE, CHARGING);
    await publish(DEVICE, { ...syntheticScene, rooms: [], doors: [] });
    await autoCreate.watch(inventory(DEVICE));
    expect(service.get().revision).toBe(0);
    expect(await autoCreate.consider({ source, deviceId: DEVICE })).toBe('no_rooms');
  });

  it('leaves a map the user drew by hand alone', async () => {
    await service.apply(
      [
        {
          op: 'addFloor',
          floor: {
            id: 'mine',
            name: 'Mine',
            level: 0,
            elevation: 0,
            ceilingHeight: 2.6,
            rooms: [],
            walls: [],
            openings: [],
            objects: [],
            placements: [],
            annotations: [],
          },
        },
      ],
      'profile:me',
    );
    setStatus(DEVICE, CHARGING);
    await publish(DEVICE, syntheticScene);
    await autoCreate.watch(inventory(DEVICE));
    expect(service.get().revision).toBe(1);
    expect(service.get().sources).toEqual([]);
    expect(await autoCreate.consider({ source, deviceId: DEVICE })).toBe('map_exists');
  });

  it('does not create a second map from a second robot', async () => {
    setStatus(DEVICE, CHARGING);
    setStatus(OTHER, CHARGING);
    await publish(DEVICE, syntheticScene);
    await publish(OTHER, { ...syntheticScene, index: 9 });
    await autoCreate.watch(inventory(DEVICE, OTHER));
    expect(service.get().revision).toBe(1);
    expect(service.get().sources.map((entry) => entry.deviceId)).toEqual([DEVICE]);
  });
});

describe('the robot map the new map is fed by', () => {
  it('records the robot map id and name on the new source', async () => {
    setStatus(DEVICE, CHARGING);
    values.set(
      keyOf(DEVICE, VACUUM_SAVED_MAPS_KEY),
      JSON.stringify([
        { robotMapId: 4, name: 'Ground', isCurrent: true, rooms: 2, version: '7:saved:4' },
      ]),
    );
    await publish(DEVICE, { ...syntheticScene, robotMapId: 4 });
    await autoCreate.watch(inventory(DEVICE));
    expect(service.get().sources.map((entry) => [entry.robotMapId, entry.robotMapName])).toEqual([
      [4, 'Ground'],
    ]);
  });

  it('leaves the id open when the published scene does not carry one', async () => {
    setStatus(DEVICE, CHARGING);
    await publish(DEVICE, syntheticScene);
    await autoCreate.watch(inventory(DEVICE));
    expect(service.get().sources.map((entry) => entry.robotMapId)).toEqual([undefined]);
  });

  it('creates nothing once any map exists, even an empty one the user made', async () => {
    await service.exclusive((maps) => maps.create('Studio', 'profile:me'));
    setStatus(DEVICE, CHARGING);
    await publish(DEVICE, syntheticScene);
    await autoCreate.watch(inventory(DEVICE));
    expect(await autoCreate.consider({ source, deviceId: DEVICE })).toBe('map_exists');
    expect(harness.repo.ids()).toHaveLength(1);
  });
});

describe('the room links of the hub', () => {
  it('puts the linked home rooms on the new map rooms in the same single revision', async () => {
    links = [storedLink(1, HOME_HALL, 'Hall'), storedLink(2, HOME_DEN, 'Den')];
    setStatus(DEVICE, CHARGING);
    await publish(DEVICE, syntheticScene);
    await autoCreate.watch(inventory(DEVICE));
    const rooms = service.get().floors[0]?.rooms ?? [];
    expect(rooms.map((room) => [room.name, room.homeRoomId])).toEqual([
      ['Hall', HOME_HALL],
      ['Den', HOME_DEN],
    ]);
    expect(service.get().revision).toBe(1);
  });

  it('leaves a room unlinked when its map room has no link and never double books a home room', async () => {
    links = [storedLink(1, HOME_HALL, 'Hall'), storedLink(2, HOME_HALL, 'Hall')];
    setStatus(DEVICE, CHARGING);
    await publish(DEVICE, syntheticScene);
    await autoCreate.watch(inventory(DEVICE));
    const rooms = service.get().floors[0]?.rooms ?? [];
    expect(rooms.map((room) => room.homeRoomId)).toEqual([HOME_HALL, null]);
  });
});

describe('watching the robots', () => {
  it('stops listening to a robot that left the inventory', async () => {
    await autoCreate.watch(inventory(DEVICE));
    await autoCreate.watch(inventory(OTHER));
    setStatus(DEVICE, CHARGING);
    await publish(DEVICE, syntheticScene);
    expect(service.get().revision).toBe(0);
    setStatus(OTHER, CHARGING);
    await publish(OTHER, syntheticScene);
    expect(service.get().revision).toBe(1);
  });

  it('stops listening after stop', async () => {
    await autoCreate.watch(inventory(DEVICE));
    autoCreate.stop();
    setStatus(DEVICE, CHARGING);
    await publish(DEVICE, syntheticScene);
    expect(service.get().revision).toBe(0);
  });

  it('watches a robot once however often the inventory is announced', async () => {
    await autoCreate.watch(inventory(DEVICE));
    await autoCreate.watch(inventory(DEVICE));
    setStatus(DEVICE, CHARGING);
    await publish(DEVICE, syntheticScene);
    expect(service.get().revision).toBe(1);
  });

  it('keeps the map document out of the logs', async () => {
    setStatus(DEVICE, CHARGING);
    await publish(DEVICE, {
      ...syntheticScene,
      rooms: syntheticScene.rooms.map((room, index) =>
        index === 0 ? { ...room, rings: [rectRing(0, 0, 4, 3)] } : room,
      ),
    });
    await autoCreate.watch(inventory(DEVICE));
    const text = JSON.stringify(logs.records);
    expect(text).not.toContain('polygon');
    expect(text).not.toContain('"outer"');
  });
});
