import type { CapabilityKey, JsonValue, ProcessWindow, VacuumSlot } from '@smarteverything/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { Viewers, deviceTarget } from '../../src/metrics/viewers';
import { VacuumLiveRoute, type RouteIo } from '../../src/vacuum/live-route';
import {
  VACUUM_LOCATING_KEY,
  VACUUM_MAP_KEYS,
  VACUUM_STATUS_KEY,
  VacuumMapService,
  runOf,
  type MapFeed,
} from '../../src/vacuum/map-service';
import { VACUUM_VIEW_TOPIC } from '../../src/vacuum/viewer-demand';
import { captureLogs, testLogger, type CapturedLogs } from '../support/logs';
import { FakeRouteTimer, flush } from '../support/route-timer';

const ROBOT = 'robot';
const HUB_ID = 'hub-robot';
const CLEANING = 4;
const PAUSED = 5;
const CHARGING = 2;
const STATION = 14;
const MAP_PUSH = JSON.stringify({ index: 1700, obj_name: 'x/y/0' });

interface FeedCall {
  readonly method: 'observePush' | 'notePush' | 'demand';
  readonly slot: VacuumSlot;
}

let logs: CapturedLogs;
let viewers: Viewers<ProcessWindow>;
let timer: FakeRouteTimer;
let feed: FeedCall[];
let actions: JsonValue[][];
let values: Map<CapabilityKey, JsonValue>;
let route: VacuumLiveRoute;
let service: VacuumMapService;

function spyFeed(): MapFeed {
  return {
    observePush: (_deviceId, slot): Promise<void> => {
      feed.push({ method: 'observePush', slot });
      return Promise.resolve();
    },
    notePush: (_deviceId, slot): void => {
      feed.push({ method: 'notePush', slot });
    },
    demand: (_deviceId, slot): Promise<void> => {
      feed.push({ method: 'demand', slot });
      return Promise.resolve();
    },
  };
}

function routeIo(): RouteIo {
  return {
    transport: 'lan',
    action: (_address, inputs): Promise<JsonValue> => {
      actions.push([...inputs]);
      return Promise.resolve([{ piid: 24, value: 'NULL' }]);
    },
  };
}

function build(): VacuumMapService {
  return new VacuumMapService({
    fetcher: spyFeed(),
    route,
    viewers,
    target: (): string => deviceTarget(HUB_ID),
    current: (_deviceId, key): JsonValue | undefined => values.get(key),
    log: testLogger('map-service'),
  });
}

function restart(): void {
  service.detach(ROBOT);
  service = build();
  service.attach(ROBOT);
}

function openViewer(holder = 'socket-1'): void {
  viewers.hold(holder, [{ target: deviceTarget(HUB_ID), topic: VACUUM_VIEW_TOPIC }]);
}

function methods(): string[] {
  return feed.map((call) => `${call.method}:${call.slot}`);
}

async function status(value: number): Promise<void> {
  await service.observe(ROBOT, VACUUM_STATUS_KEY, value);
}

async function mapPush(slot: VacuumSlot = 'current'): Promise<void> {
  await service.observe(ROBOT, VACUUM_MAP_KEYS[slot], MAP_PUSH);
}

beforeEach(() => {
  logs = captureLogs();
  viewers = new Viewers<ProcessWindow>();
  timer = new FakeRouteTimer();
  feed = [];
  actions = [];
  values = new Map();
  route = new VacuumLiveRoute({
    io: (): RouteIo => routeIo(),
    timer,
    changed: (): void => undefined,
    log: testLogger('route'),
  });
  service = build();
  service.attach(ROBOT);
});

describe('the run classification', () => {
  it('counts moving, paused and idle statuses and the post-run station cycle as idle', () => {
    expect(runOf(CLEANING)).toBe('moving');
    expect(runOf(6)).toBe('moving');
    expect(runOf(PAUSED)).toBe('paused');
    expect(runOf(18)).toBe('paused');
    expect(runOf(CHARGING)).toBe('idle');
    expect(runOf(STATION)).toBe('idle');
    expect(runOf(12)).toBe('moving');
    expect(runOf(undefined)).toBe('idle');
  });
});

describe('the fetch demand policy', () => {
  it('fetches every index change while the robot is idle', async () => {
    await status(CHARGING);
    await mapPush('current');
    await mapPush('saved');
    await mapPush('backup');
    expect(methods()).toEqual(['observePush:current', 'observePush:saved', 'observePush:backup']);
  });

  it('only notes the index while a task runs and no viewer is open', async () => {
    await status(CHARGING);
    await status(CLEANING);
    feed.length = 0;
    await mapPush('current');
    await mapPush('saved');
    expect(methods()).toEqual(['notePush:current', 'notePush:saved']);
  });

  it('fetches each index while a task runs and a viewer is open', async () => {
    await status(CHARGING);
    await status(CLEANING);
    openViewer();
    feed.length = 0;
    await mapPush('current');
    expect(methods()).toEqual(['observePush:current']);
  });

  it('keeps deferring while paused and fetches the noted indexes once at the end', async () => {
    await status(CLEANING);
    await status(PAUSED);
    feed.length = 0;
    await mapPush('current');
    expect(methods()).toEqual(['notePush:current']);
    await status(STATION);
    expect(methods()).toEqual([
      'notePush:current',
      'demand:current',
      'demand:saved',
      'demand:backup',
    ]);
  });

  it('does not fetch at the end when the status stays the same', async () => {
    await status(CHARGING);
    await status(CHARGING);
    expect(methods()).toEqual([]);
  });
});

describe('the on-open fetch', () => {
  it('asks for the current index once when a viewer opens', async () => {
    values.set(VACUUM_MAP_KEYS.current, MAP_PUSH);
    openViewer();
    await flush();
    expect(methods()).toEqual(['observePush:current']);
    openViewer('socket-2');
    await flush();
    expect(methods()).toEqual(['observePush:current']);
  });

  it('asks again when the viewer left and opened again', async () => {
    values.set(VACUUM_MAP_KEYS.current, MAP_PUSH);
    openViewer();
    viewers.release('socket-1');
    openViewer();
    await flush();
    expect(methods()).toEqual(['observePush:current', 'observePush:current']);
  });

  it('logs and fetches nothing when the robot has not reported an index yet', async () => {
    openViewer();
    await flush();
    expect(methods()).toEqual([]);
    expect(logs.events()).toContain('vacuum_map.ensure_without_index');
  });

  it('serves a page request for another slot through ensure', async () => {
    values.set(VACUUM_MAP_KEYS.saved, MAP_PUSH);
    await service.ensure(ROBOT, 'saved');
    expect(methods()).toEqual(['observePush:saved']);
  });
});

describe('the live route exception', () => {
  async function ticks(): Promise<void> {
    await timer.fire();
    await flush();
  }

  it('makes no A2.47 call without a viewer, without a working robot or while locating', async () => {
    await status(CHARGING);
    openViewer();
    await flush();
    expect(timer.armed()).toBe(0);
    viewers.release('socket-1');
    await status(CLEANING);
    await service.observe(ROBOT, VACUUM_LOCATING_KEY, true);
    openViewer();
    await flush();
    expect(timer.armed()).toBe(0);
    expect(actions).toHaveLength(0);
  });

  it('polls only while a viewer is open and the robot is moving', async () => {
    await status(CLEANING);
    openViewer();
    await ticks();
    await ticks();
    expect(actions).toEqual([
      [{ piid: 24, value: '{"pose_id":0}' }],
      [{ piid: 24, value: '{"pose_id":0}' }],
    ]);
  });

  it('starts when the relocation ends', async () => {
    await status(CLEANING);
    await service.observe(ROBOT, VACUUM_LOCATING_KEY, true);
    openViewer();
    expect(timer.armed()).toBe(0);
    await service.observe(ROBOT, VACUUM_LOCATING_KEY, false);
    expect(timer.armed()).toBe(1);
  });

  it('stops at once when the viewer leaves', async () => {
    await status(CLEANING);
    openViewer();
    await ticks();
    viewers.release('socket-1');
    expect(timer.armed()).toBe(0);
    const calls = actions.length;
    await flush();
    expect(actions).toHaveLength(calls);
  });

  it('stops at once when the robot pauses, docks or enters the station cycle', async () => {
    await status(CLEANING);
    openViewer();
    expect(timer.armed()).toBe(1);
    await status(PAUSED);
    expect(timer.armed()).toBe(0);
    await status(CLEANING);
    expect(timer.armed()).toBe(1);
    await status(STATION);
    expect(timer.armed()).toBe(0);
    expect(actions).toHaveLength(0);
  });

  it('keeps the viewer open after a new socket joins and one leaves', async () => {
    await status(CLEANING);
    openViewer('socket-1');
    openViewer('socket-2');
    viewers.release('socket-1');
    expect(timer.armed()).toBe(1);
    viewers.release('socket-2');
    expect(timer.armed()).toBe(0);
  });
});

describe('demand after a restart or a reconnect', () => {
  it('registers the viewers that were already connected when the device attaches', () => {
    openViewer();
    values.set(VACUUM_STATUS_KEY, CLEANING);
    restart();
    expect(timer.armed()).toBe(1);
  });

  it('picks the demand up when the socket reconnects after the hub restarted', () => {
    values.set(VACUUM_STATUS_KEY, CLEANING);
    restart();
    expect(timer.armed()).toBe(0);
    openViewer();
    expect(timer.armed()).toBe(1);
  });

  it('stops while the socket is gone and starts again when it reconnects', async () => {
    await status(CLEANING);
    openViewer();
    viewers.release('socket-1');
    expect(timer.armed()).toBe(0);
    openViewer('socket-2');
    expect(timer.armed()).toBe(1);
  });

  it('re-attaching the device keeps one follower and one route', async () => {
    await status(CLEANING);
    openViewer();
    service.attach(ROBOT);
    service.attach(ROBOT);
    expect(timer.armed()).toBe(1);
    viewers.release('socket-1');
    expect(timer.armed()).toBe(0);
  });

  it('stops following when the device detaches', async () => {
    await status(CLEANING);
    openViewer();
    service.detach(ROBOT);
    expect(timer.armed()).toBe(0);
    viewers.release('socket-1');
    openViewer('socket-2');
    expect(timer.armed()).toBe(0);
  });
});
