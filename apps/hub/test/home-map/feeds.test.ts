import {
  HOME_MAP_FLOOR_ID,
  HOME_MAP_MAP_ID,
  type HomeMap,
  type HomeMapFeedTarget,
  type HomeMapId,
  type HomeMapOp,
  type VacuumScene,
} from '@smarteverything/domain';
import { pv11glCatalog } from '@smarteverything/xiaomi';
import { beforeEach, describe, expect, it } from 'vitest';
import { HomeMapAutoCreate } from '../../src/home-map/auto-create';
import { RobotMapFeeds, type FeedPorts } from '../../src/home-map/feeds';
import { MapSourceRegistry } from '../../src/home-map/sources/registry';
import { captureLogs, testLogger, type CapturedLogs } from '../support/logs';
import {
  CHARGING,
  CLEANING,
  FakeRobot,
  downstairs,
  floorOp,
  jittered,
  mapHarness,
  upstairs,
  widened,
  type MapHarness,
} from './feed-fixtures';
import { DEVICE, NOW } from './import-fixtures';

const MODEL = pv11glCatalog().model;
const ME = 'profile:me';
const INVENTORY = [{ id: DEVICE, provider: 'xiaomi', model: MODEL }] as const;
const HOME = HOME_MAP_MAP_ID.parse('home');

let logs: CapturedLogs;
let harness: MapHarness;
let robot: FakeRobot;
let feeds: RobotMapFeeds;
let synced: string[];
let counter: number;

const target = (mapId: HomeMapId, floorId: string): HomeMapFeedTarget => ({
  mapId,
  floorId: HOME_MAP_FLOOR_ID.parse(floorId),
});

const mapOf = (mapId: HomeMapId = HOME): HomeMap => harness.service.get(mapId);

const roomNames = (map: HomeMap, floorId: string): (string | null)[] =>
  map.floors.find((floor) => floor.id === floorId)?.rooms.map((room) => room.name) ?? [];

const noticesOf = (map: HomeMap): string[] =>
  map.notices.filter((n) => n.kind === 'source_new_robot_map').map((n) => n.detail);

const makeHome = (): void => {
  harness.service.apply([floorOp('down', 'Downstairs'), floorOp('up', 'Upstairs')], ME);
};

const makeStudio = (): HomeMapId => {
  const studio = harness.repo.create('Studio', ME);
  harness.service.apply([floorOp('studio-0', 'Studio floor')], ME, {}, studio.id);
  return studio.id;
};

const listBoth = (current: VacuumScene = downstairs, other: VacuumScene = upstairs): void => {
  robot.list({ scene: current, isCurrent: true }, { scene: other, isCurrent: false });
};

const feed = (robotMapId: number, to: HomeMapFeedTarget | null): void => {
  feeds.setFeed(DEVICE, robotMapId, to ?? { target: null }, ME);
};

const buildFeeds = (maps: FeedPorts['maps']): RobotMapFeeds =>
  new RobotMapFeeds({
    source: robot.source,
    maps,
    sets: {
      ids: (): HomeMapId[] => harness.repo.ids(),
      defaultId: (): HomeMapId | null => harness.repo.defaultId(),
      locations: (deviceId) => harness.repo.sourceLocations(deviceId),
    },
    inventory: () => INVENTORY,
    atomically: (work) => harness.context.write(work),
    links: { list: () => [] },
    syncLinks: (deviceId): number => {
      synced.push(deviceId);
      return 0;
    },
    newId: (): string => `feed-${String((counter += 1))}`,
    now: (): string => NOW,
    log: testLogger('home-map'),
  });

beforeEach(() => {
  logs = captureLogs();
  harness = mapHarness();
  robot = new FakeRobot(DEVICE);
  synced = [];
  counter = 0;
  feeds = buildFeeds(harness.service);
  feeds.watch(INVENTORY);
  robot.status(CHARGING);
});

describe('settled imports only', () => {
  beforeEach(() => {
    makeHome();
    robot.publishCurrent(downstairs);
    listBoth();
    feed(1, target(HOME, 'down'));
  });

  it('imports nothing for a push in the middle of a clean and one revision when it ends', () => {
    const before = mapOf().revision;
    robot.status(CLEANING);
    robot.publishCurrent(widened(downstairs, 8));
    robot.publishCurrent(widened(downstairs, 9));
    robot.list(
      { scene: widened(downstairs, 10), isCurrent: true },
      { scene: upstairs, isCurrent: false },
    );
    expect(mapOf().revision).toBe(before);
    robot.status(CHARGING);
    robot.source.cycleFinished(DEVICE);
    robot.source.cycleFinished(DEVICE);
    robot.source.statusChanged(DEVICE);
    expect(mapOf().revision).toBe(before + 1);
    expect(mapOf().notices.filter((notice) => notice.kind === 'source_moved')).toEqual([]);
    const hall = mapOf().floors.find((floor) => floor.id === 'down')?.rooms[0];
    expect(hall?.polygon.outer.some((point) => point.y > 3.7)).toBe(true);
  });

  it('makes no revision for a re-push that only jitters by millimetres', () => {
    const before = mapOf().revision;
    robot.publishCurrent(jittered(downstairs, 8));
    robot.publishCurrent(jittered(downstairs, 9));
    expect(mapOf().revision).toBe(before);
    expect(logs.events()).not.toContain('home_map.feed_import_failed');
  });

  it('imports one version once', () => {
    robot.publishCurrent(widened(downstairs, 8));
    const after = mapOf().revision;
    expect(feeds.follow(DEVICE, 1)).toBe('duplicate');
    expect(mapOf().revision).toBe(after);
  });
});

describe('each robot map lands on its own floor', () => {
  it('feeds the floors independently and a change of one robot map touches only its floor', () => {
    makeHome();
    robot.publishCurrent(downstairs);
    listBoth();
    feed(1, target(HOME, 'down'));
    feed(2, target(HOME, 'up'));
    const map = mapOf();
    expect(roomNames(map, 'down')).toEqual(['Hall', 'Den']);
    expect(roomNames(map, 'up')).toEqual(['Bedroom', 'Bath']);
    expect(
      map.sources.map((entry) => [entry.robotMapId, entry.robotMapName, entry.floorId]),
    ).toEqual(
      expect.arrayContaining([
        [1, 'Downstairs', 'down'],
        [2, 'Upstairs', 'up'],
      ]),
    );
    const downRooms = map.floors.find((floor) => floor.id === 'down')?.rooms ?? [];
    const before = map.revision;
    listBoth(downstairs, widened(upstairs, 10));
    const after = mapOf();
    expect(after.revision).toBe(before + 1);
    expect(after.floors.find((floor) => floor.id === 'down')?.rooms).toEqual(downRooms);
    expect(roomNames(after, 'up')).toEqual(['Bedroom', 'Bath']);
    const bedroom = after.floors.find((floor) => floor.id === 'up')?.rooms[0];
    const was = map.floors.find((floor) => floor.id === 'up')?.rooms[0];
    expect(bedroom?.polygon).not.toEqual(was?.polygon);
  });

  it('places the robot once even when two robot maps both carry a dock', () => {
    makeHome();
    robot.publishCurrent(downstairs);
    const dockUp: VacuumScene = { ...upstairs, dock: { x: 1, y: 1, yaw: 0 } };
    listBoth(downstairs, dockUp);
    feed(1, target(HOME, 'down'));
    feed(2, target(HOME, 'up'));
    const placements = mapOf().floors.flatMap((floor) => floor.placements);
    expect(placements.map((placement) => placement.deviceId)).toEqual([DEVICE]);
  });

  it('refuses a floor another map of the same robot already feeds and writes nothing', () => {
    makeHome();
    robot.publishCurrent(downstairs);
    listBoth();
    feed(1, target(HOME, 'down'));
    const before = mapOf().revision;
    expect(() => {
      feed(2, target(HOME, 'down'));
    }).toThrow(/already feeds/u);
    expect(mapOf().revision).toBe(before);
  });

  it('refuses the current robot map while the robot is cleaning and writes nothing', () => {
    makeHome();
    robot.publishCurrent(downstairs);
    listBoth();
    robot.status(CLEANING);
    expect(() => {
      feed(1, target(HOME, 'down'));
    }).toThrow(/not finished/u);
    expect(mapOf().sources).toEqual([]);
    feed(2, target(HOME, 'up'));
    expect(roomNames(mapOf(), 'up')).toEqual(['Bedroom', 'Bath']);
  });
});

describe('a new robot map', () => {
  it('makes one notice on the default map per robot map however often it changes', () => {
    makeHome();
    robot.publishCurrent(downstairs);
    listBoth();
    expect(noticesOf(mapOf())).toEqual(['Downstairs', 'Upstairs']);
    listBoth(downstairs, widened(upstairs, 10));
    listBoth(widened(downstairs, 11), widened(upstairs, 12));
    expect(noticesOf(mapOf())).toEqual(['Downstairs', 'Upstairs']);
    expect(logs.events().filter((event) => event === 'home_map.new_robot_map')).toHaveLength(2);
  });

  it('clears its notice when the robot map is given a floor', () => {
    makeHome();
    robot.publishCurrent(downstairs);
    listBoth();
    feed(2, target(HOME, 'up'));
    expect(noticesOf(mapOf())).toEqual(['Downstairs']);
  });

  it('leaves the first map to auto create when no map exists at all', () => {
    robot.publishCurrent(downstairs);
    listBoth();
    expect(feeds.follow(DEVICE, 1)).toBe('no_map');
    expect(harness.repo.ids()).toEqual([]);
  });
});

describe('moving a feed', () => {
  it('leaves the old floor rooms behind as hand rooms and fills the new floor', () => {
    makeHome();
    const studio = makeStudio();
    robot.publishCurrent(downstairs);
    listBoth();
    feed(1, target(HOME, 'down'));
    const old = mapOf().floors.find((floor) => floor.id === 'down');
    const homeRevision = mapOf().revision;
    const studioRevision = mapOf(studio).revision;
    feed(1, target(studio, 'studio-0'));
    const left = mapOf().floors.find((floor) => floor.id === 'down');
    expect(left?.rooms.map((room) => [room.name, room.polygon, room.origin.kind])).toEqual(
      old?.rooms.map((room) => [room.name, room.polygon, 'hand']),
    );
    expect(left?.walls.every((wall) => wall.origin.kind === 'hand')).toBe(true);
    expect(mapOf().sources).toEqual([]);
    expect(mapOf().revision).toBe(homeRevision + 1);
    expect(roomNames(mapOf(studio), 'studio-0')).toEqual(['Hall', 'Den']);
    expect(mapOf(studio).sources.map((entry) => entry.robotMapId)).toEqual([1]);
    expect(mapOf(studio).revision).toBe(studioRevision + 1);
  });

  it('moves a feed between floors of the same map in one revision', () => {
    makeHome();
    robot.publishCurrent(downstairs);
    listBoth();
    feed(1, target(HOME, 'down'));
    const before = mapOf().revision;
    feed(1, target(HOME, 'up'));
    expect(mapOf().revision).toBe(before + 1);
    expect(mapOf().sources.map((entry) => entry.floorId)).toEqual(['up']);
    expect(roomNames(mapOf(), 'up')).toEqual(['Hall', 'Den']);
    expect(
      mapOf()
        .floors.find((floor) => floor.id === 'down')
        ?.rooms.every((r) => r.origin.kind === 'hand'),
    ).toBe(true);
  });

  it('writes nothing when the feed is set to where it already is', () => {
    makeHome();
    robot.publishCurrent(downstairs);
    listBoth();
    feed(1, target(HOME, 'down'));
    const before = mapOf().revision;
    feed(1, target(HOME, 'down'));
    expect(mapOf().revision).toBe(before);
  });

  it('rolls everything back when the new floor cannot be fed', () => {
    makeHome();
    robot.publishCurrent(downstairs);
    listBoth();
    feed(1, target(HOME, 'down'));
    const before = mapOf();
    expect(() => {
      feed(1, target(HOME, 'missing-floor'));
    }).toThrow(/no floor/u);
    expect(mapOf()).toEqual(before);
  });

  it('rolls the old floor back when the write to the new map fails', () => {
    makeHome();
    const studio = makeStudio();
    robot.publishCurrent(downstairs);
    listBoth();
    feed(1, target(HOME, 'down'));
    const before = mapOf();
    const failing = buildFeeds({
      get: (mapId) => harness.service.get(mapId),
      apply: (ops, actor, mark, mapId) => {
        if (mapId === studio) throw new Error('disk full');
        return harness.service.apply(ops, actor, mark, mapId);
      },
    });
    expect(() => {
      failing.setFeed(DEVICE, 1, target(studio, 'studio-0'), ME);
    }).toThrow(/disk full/u);
    expect(mapOf()).toEqual(before);
  });

  it('is Not used when the target is null: the rooms stay as hand rooms and the feed is listed unused', () => {
    makeHome();
    robot.publishCurrent(downstairs);
    listBoth();
    feed(1, target(HOME, 'down'));
    feed(1, null);
    expect(mapOf().sources).toEqual([]);
    expect(roomNames(mapOf(), 'down')).toEqual(['Hall', 'Den']);
    expect(feeds.list().map((entry) => [entry.robotMapId, entry.target])).toEqual([
      [1, null],
      [2, null],
    ]);
    expect(noticesOf(mapOf())).toEqual(['Upstairs']);
  });
});

describe('a floor that already has rooms', () => {
  const floorOf = (map: HomeMap, floorId: string): HomeMap['floors'][number] | undefined =>
    map.floors.find((floor) => floor.id === floorId);

  const handRoomFar = (map: HomeMap): HomeMapOp => {
    const sample = floorOf(map, 'down')?.rooms[0];
    if (sample === undefined) throw new Error('no sample room');
    const outer = [
      { x: 30, y: 30 },
      { x: 32, y: 30 },
      { x: 32, y: 32 },
      { x: 30, y: 32 },
    ];
    const element = {
      ...sample,
      id: 'hand-far',
      name: 'Far room',
      polygon: { outer, holes: [] },
      labelAt: { x: 31, y: 31 },
      origin: { kind: 'hand' },
    };
    return { op: 'add', kind: 'room', floorId: 'up', element };
  };

  beforeEach(() => {
    makeHome();
    robot.publishCurrent(downstairs);
    listBoth();
    feed(1, target(HOME, 'down'));
  });

  it('adopts the hand rooms an earlier detach left behind instead of drawing them twice', () => {
    feed(1, target(HOME, 'up'));
    const left = floorOf(mapOf(), 'down')?.rooms ?? [];
    expect(left.every((room) => room.origin.kind === 'hand')).toBe(true);
    feed(1, target(HOME, 'down'));
    const map = mapOf();
    const back = floorOf(map, 'down');
    const [source] = map.sources.filter((entry) => entry.floorId === 'down');
    expect(back?.rooms.map((room) => room.id)).toEqual(left.map((room) => room.id));
    expect(back?.rooms.map((room) => room.polygon)).toEqual(left.map((room) => room.polygon));
    expect(
      back?.rooms.every(
        (room) => room.origin.kind === 'source' && room.origin.sourceId === source?.id,
      ),
    ).toBe(true);
    expect(floorOf(map, 'up')?.rooms.every((room) => room.origin.kind === 'hand')).toBe(true);
    expect(map.notices.filter((notice) => notice.kind === 'source_moved')).toEqual([]);
  });

  it('keeps a hand shape the user changed and follows the robot for the rest', () => {
    feed(1, target(HOME, 'up'));
    const hall = floorOf(mapOf(), 'down')?.rooms[0];
    if (hall === undefined) throw new Error('no hall');
    const inset = {
      outer: [
        { x: 0.7, y: 0.7 },
        { x: 4.3, y: 0.7 },
        { x: 4.3, y: 3.3 },
        { x: 0.7, y: 3.3 },
      ],
      holes: [],
    };
    harness.service.apply(
      [{ op: 'update', kind: 'room', floorId: 'down', id: hall.id, patch: { polygon: inset } }],
      ME,
    );
    feed(1, target(HOME, 'down'));
    const back = floorOf(mapOf(), 'down')?.rooms.find((room) => room.id === hall.id);
    expect(back?.polygon).toEqual(inset);
    expect(back?.origin.kind === 'source' ? back.origin.overridden : []).toEqual(['polygon']);
    expect(floorOf(mapOf(), 'down')?.rooms).toHaveLength(2);
  });

  it('writes the align notice and overlays nothing when the robot map does not fit', () => {
    harness.service.apply([handRoomFar(mapOf())], ME);
    feed(1, target(HOME, 'up'));
    const map = mapOf();
    const up = floorOf(map, 'up');
    expect(up?.rooms.map((room) => room.name)).toEqual(['Far room']);
    expect(up?.walls).toEqual([]);
    const [stub] = map.sources;
    expect([stub?.floorId, stub?.robotMapId, stub?.base.rooms]).toEqual(['up', 1, []]);
    expect(
      map.notices.filter((notice) => notice.kind === 'source_moved').map((n) => n.elementId),
    ).toEqual([stub?.id]);
    expect(logs.events()).toContain('home_map.feed_refused');
    const before = map.revision;
    robot.publishCurrent(widened(downstairs, 8));
    robot.publishCurrent(widened(downstairs, 9));
    expect(mapOf().revision).toBe(before);
    expect(floorOf(mapOf(), 'up')?.rooms).toHaveLength(1);
  });
});

describe('a hand drawn floor the robot map is offset from', () => {
  const OFFSET = { x: 0.6, y: 0.4 };

  const shifted = (room: HomeMap['floors'][number]['rooms'][number]): HomeMapOp => ({
    op: 'add',
    kind: 'room',
    floorId: 'up',
    element: {
      ...room,
      id: `hand-${room.id}`,
      origin: { kind: 'hand' },
      polygon: {
        outer: room.polygon.outer.map((p) => ({ x: p.x + OFFSET.x, y: p.y + OFFSET.y })),
        holes: [],
      },
      labelAt: { x: room.labelAt.x + OFFSET.x, y: room.labelAt.y + OFFSET.y },
    },
  });

  it('fits the robot walls to the drawn rooms and writes the realign notice', () => {
    makeHome();
    robot.publishCurrent(downstairs);
    listBoth();
    feed(1, target(HOME, 'down'));
    const drawn = mapOf().floors.find((floor) => floor.id === 'down')?.rooms ?? [];
    harness.service.apply(drawn.map(shifted), ME);
    const wallsBefore = mapOf().floors.find((floor) => floor.id === 'down')?.walls ?? [];
    feed(1, target(HOME, 'up'));
    const map = mapOf();
    const up = map.floors.find((floor) => floor.id === 'up');
    const source = map.sources.find((entry) => entry.floorId === 'up');
    expect(up?.rooms.every((room) => room.origin.kind === 'source')).toBe(true);
    expect(
      up?.rooms.every(
        (room) => room.origin.kind === 'source' && room.origin.overridden.length === 0,
      ),
    ).toBe(true);
    const shiftedWalls = wallsBefore.map((wall) => [
      Math.round((wall.from.x + OFFSET.x) * 1000),
      Math.round((wall.from.y + OFFSET.y) * 1000),
    ]);
    expect(
      up?.walls.map((wall) => [Math.round(wall.from.x * 1000), Math.round(wall.from.y * 1000)]),
    ).toEqual(shiftedWalls);
    expect(source?.base.rooms.length).toBeGreaterThan(0);
    expect(
      map.notices.filter((notice) => notice.kind === 'source_moved').map((n) => n.elementId),
    ).toEqual([source?.id]);
  });
});

describe('listing the feeds', () => {
  it('lists every robot map with its floor and a map the robot no longer has', () => {
    makeHome();
    robot.publishCurrent(downstairs);
    listBoth();
    feed(1, target(HOME, 'down'));
    feed(2, target(HOME, 'up'));
    robot.list({ scene: downstairs, isCurrent: true });
    expect(
      feeds.list().map((entry) => [entry.robotMapId, entry.isCurrent, entry.target?.floorId]),
    ).toEqual([
      [1, true, 'down'],
      [2, false, 'up'],
    ]);
  });

  it('refuses a robot map the robot never had and a device that is not a vacuum', () => {
    makeHome();
    expect(() => {
      feed(99, null);
    }).toThrow(/no such map/u);
    expect(() => {
      feeds.setFeed('00000000-0000-4000-8000-000000000000', 1, { target: null }, ME);
    }).toThrow(/no robot maps/u);
  });
});

describe('the source made before robot map ids existed', () => {
  it('binds to the current robot map on its first settled scene, once, and keeps feeding it', () => {
    const registry = new MapSourceRegistry([robot.source]);
    const auto = new HomeMapAutoCreate({
      registry,
      maps: harness.service,
      sets: { ids: (): HomeMapId[] => harness.repo.ids() },
      currentMap: (): null => null,
      links: { list: (): [] => [] },
      newId: (): string => `auto-${String((counter += 1))}`,
      now: (): string => NOW,
      log: testLogger('home-map'),
    });
    robot.publishCurrent(downstairs);
    expect(auto.consider({ source: robot.source, deviceId: DEVICE })).toBe('created');
    expect(mapOf().sources.map((entry) => entry.robotMapId)).toEqual([undefined]);
    const before = mapOf().revision;
    robot.publishCurrent(widened(downstairs, 8));
    expect(mapOf().sources.map((entry) => [entry.robotMapId, entry.robotMapName])).toEqual([
      [1, 'Downstairs'],
    ]);
    expect(mapOf().revision).toBe(before + 1);
    robot.publishCurrent(widened(downstairs, 9));
    robot.publishCurrent(widened(downstairs, 10));
    expect(logs.events().filter((event) => event === 'home_map.source_bound')).toHaveLength(1);
    expect(noticesOf(mapOf())).toEqual([]);
  });
});
