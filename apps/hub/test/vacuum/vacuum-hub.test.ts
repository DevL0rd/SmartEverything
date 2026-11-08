import {
  ApiError,
  CAPABILITY_KEY,
  VACUUM_FAULT_KEY,
  parseVacuumFault,
  type DeviceCapability,
  type DeviceEvent,
  type JsonValue,
  type ProcessWindow,
  type Provider,
  type StateUpdate,
} from '@smarteverything/domain';
import { pv11glCatalog, stopCleaning } from '@smarteverything/xiaomi';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { DeviceRecord } from '../../src/database/port';
import { Viewers, deviceTarget } from '../../src/metrics/viewers';
import type { VacuumDeviceIo } from '../../src/vacuum/link';
import { MapCache } from '../../src/vacuum/map-cache';
import { VacuumHub } from '../../src/vacuum/vacuum-hub';
import { readVacuumFixture, vacuumObjectName, type VacuumIdentity } from '../support/fake-vacuum';
import { sealVacuumMap } from '../support/fake-vacuum-cloud';
import { captureLogs, testLogger } from '../support/logs';
import { FakeRouteTimer, flush } from '../support/route-timer';
import { testStore, type TestStore } from '../support/store';

const IDENTITY: VacuumIdentity = { did: '5550001', uid: '4440002' };
const NOW = '2026-10-24T10:00:00.000Z';
const STATUS = 'raw:2.2';
const MAP_INDEX = 'raw:10.1';
const FAULTS = 'raw:2.66';
const SOURCE = 'xiaomi://1:de@10.0.0.9?did=5550001&model=xiaomi.vacuum.pv11gl&transport=udp';
const OFFER = 'v=0\r\nm=video 9 UDP/TLS/RTP 96\r\na=recvonly\r\n';
const VIDEO_STATUS = JSON.stringify({
  video_switch_status: false,
  physical_control_lock: true,
  video_passwd_exist: true,
});
const KEYS = [STATUS, 'raw:2.4', 'raw:2.5', 'raw:2.6', 'raw:2.7', 'raw:2.40', MAP_INDEX, FAULTS];
const TEXT_KEYS: ReadonlySet<string> = new Set(['raw:2.40', MAP_INDEX, FAULTS]);

interface Pushed {
  readonly provider: Provider;
  readonly update: StateUpdate;
}

interface Recorded {
  readonly provider: Provider;
  readonly event: DeviceEvent;
}

let opened: TestStore;
let values: Map<string, JsonValue>;
let pushed: Pushed[];
let recorded: Recorded[];
let viewers: Viewers<ProcessWindow>;
let timer: FakeRouteTimer;
let hub: VacuumHub;
let robot: DeviceRecord;
let actions: { readonly siid: number; readonly aiid: number }[];
let streams: string[];
let writes: number;
let routeEnd: number;

const ROUTE_INPUT = z.tuple([z.object({ piid: z.literal(24), value: z.string() })]);
const POSE_INPUT = z.object({ pose_id: z.number().int() });

function routeAnswer(inputs: readonly JsonValue[]): JsonValue {
  const from = POSE_INPUT.parse(JSON.parse(ROUTE_INPUT.parse(inputs)[0].value)).pose_id;
  const points = Array.from({ length: Math.max(0, routeEnd - from) }, (_, offset) => ({
    pose_id: from + offset,
    x: -700 + (from + offset) * 70,
    y: 0,
    type: 1,
    sweep_mop_mode: 1,
    yaw: 0,
  }));
  return [{ piid: 24, value: JSON.stringify({ points }) }];
}

function capabilityOf(key: string): DeviceCapability {
  return {
    key: CAPABILITY_KEY.parse(key),
    label: key,
    access: 'read',
    value: TEXT_KEYS.has(key)
      ? { kind: 'text', maxLength: 4000 }
      : { kind: 'number', min: 0, max: 1_000_000, step: 1 },
  };
}

function addRobot(): DeviceRecord {
  const [row] = opened.store.devices.upsert([
    {
      provider: 'xiaomi',
      externalId: IDENTITY.did,
      parentId: null,
      kind: 'vacuum',
      name: 'Robot',
      model: pv11glCatalog().model,
      manufacturer: 'Xiaomi',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: KEYS.map(capabilityOf),
      details: { vacuumVideoSource: SOURCE },
    },
  ]);
  if (row === undefined) throw new Error('The robot was not stored.');
  return {
    id: row.id,
    provider: 'xiaomi',
    externalId: row.external_id,
    parentId: null,
    kind: row.kind,
    online: true,
    roomId: null,
    capabilities: row.capabilities,
    details: {},
  };
}

function change(capability: string, value: JsonValue): void {
  const previous = values.get(capability);
  values.set(capability, value);
  hub.observe({
    deviceId: robot.id,
    capability: CAPABILITY_KEY.parse(capability),
    value,
    previous,
  });
}

function io(): VacuumDeviceIo {
  return {
    transport: 'lan',
    write: (): Promise<void> => {
      writes += 1;
      return Promise.resolve();
    },
    action: (address, inputs): Promise<JsonValue> => {
      actions.push(address);
      if (address.siid === 21) {
        const value = address.aiid === 5 ? VIDEO_STATUS : '0';
        return Promise.resolve([{ piid: 7, value }]);
      }
      return Promise.resolve(address.aiid === 47 ? routeAnswer(inputs) : []);
    },
  };
}

function bindLink(): void {
  const blob = sealVacuumMap(
    readVacuumFixture('maps/pv11gl-current.json', z.unknown()),
    pv11glCatalog().model,
    IDENTITY.did,
  );
  hub.link.bind({
    io: (did) => (did === IDENTITY.did ? io() : null),
    cloud: {
      call: (): Promise<JsonValue> => Promise.resolve({ url: 'https://fds.vacuum.test/map' }),
      download: (): Promise<Uint8Array> => Promise.resolve(blob),
    },
  });
}

function pushedOf(capability: string): readonly JsonValue[] {
  return pushed
    .filter((entry) => entry.update.capability === capability)
    .map((entry) => entry.update.value);
}

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
  values = new Map([[STATUS, 2]]);
  pushed = [];
  recorded = [];
  actions = [];
  streams = [];
  writes = 0;
  routeEnd = 0;
  viewers = new Viewers<ProcessWindow>();
  timer = new FakeRouteTimer();
  hub = new VacuumHub({
    store: opened.store,
    state: {
      valueOf: (_deviceId, key): JsonValue | undefined => values.get(key),
      push: (provider, update): void => {
        pushed.push({ provider, update });
      },
    },
    events: {
      fromProvider: (provider, event): void => {
        recorded.push({ provider, event });
      },
    },
    viewers,
    timer,
    video: {
      client: {
        putStream: (name): Promise<void> => {
          streams.push(`put ${name}`);
          return Promise.resolve();
        },
        deleteStream: (name): Promise<void> => {
          streams.push(`delete ${name}`);
          return Promise.resolve();
        },
        answer: (): Promise<string> => Promise.resolve(''),
      },
      blockingAddress: (): null => null,
    },
    now: (): Date => new Date(NOW),
    log: testLogger('vacuum'),
  });
  robot = addRobot();
});

afterEach(async () => {
  await hub.stop();
  await opened.close();
});

describe('the vacuum composition of the hub', () => {
  it('does nothing before it starts and attaches the robot once the state is loaded', () => {
    hub.sync([robot]);
    viewers.hold('live:1', [{ target: deviceTarget(robot.id), topic: 'live' }]);
    expect(timer.armed()).toBe(0);
    hub.start([robot]);
    expect(timer.armed()).toBe(0);
  });

  it('fetches a new map index, writes the map version under the robot and caches the scene', async () => {
    bindLink();
    hub.start([robot]);
    change(MAP_INDEX, JSON.stringify({ index: 31, obj_name: vacuumObjectName(IDENTITY, 0) }));
    await flush();
    await flush();
    expect(pushedOf('raw:vacuum_map')).toStrictEqual(['31:current']);
    expect(pushed[0]?.provider).toBe('xiaomi');
    expect(pushed[0]?.update.externalId).toBe(IDENTITY.did);
    expect(hub.cache.latest(robot.id, 'current')?.index).toBe(31);
  });

  it('stores a clean the moment the robot starts, with no map published', () => {
    hub.start([robot]);
    change(STATUS, 4);
    expect(opened.store.vacuumCleans.open(robot.id)).toMatchObject({
      startedAt: NOW,
      endedAt: null,
    });
  });

  it('runs the live route only while the map is on screen and the robot works, and writes the pose', async () => {
    bindLink();
    values.set(STATUS, 4);
    hub.start([robot]);
    expect(timer.armed()).toBe(0);
    viewers.hold('live:1', [{ target: deviceTarget(robot.id), topic: 'live' }]);
    expect(timer.armed()).toBe(1);
    await timer.fire();
    expect(actions).toStrictEqual([{ siid: 2, aiid: 47 }]);
    viewers.release('live:1');
    expect(timer.armed()).toBe(0);
  });

  it('grows the scene trail and robot from the live route and keeps them after a restart', async () => {
    bindLink();
    values.set(STATUS, 4);
    values.set(MAP_INDEX, JSON.stringify({ index: 31, obj_name: vacuumObjectName(IDENTITY, 0) }));
    hub.start([robot]);
    viewers.hold('live:1', [{ target: deviceTarget(robot.id), topic: 'live' }]);
    await flush();
    await flush();
    routeEnd = 60;
    await timer.fire();
    const scene = hub.cache.latest(robot.id, 'current');
    expect(scene?.index).toBe(31);
    expect(scene?.trail.flatMap((run) => run.points)).toHaveLength(60);
    expect(scene?.robot).toStrictEqual({ x: 3.43, y: 0, yaw: 0 });
    const reopened = new MapCache(opened.store.vacuumScenes).latest(robot.id, 'current');
    expect(reopened?.trail).toStrictEqual(scene?.trail);
  });

  it('sends a map command to the robot through the account link and refuses without one', async () => {
    hub.start([robot]);
    const { control } = hub.routes();
    await expect(control.run(robot.id, stopCleaning())).rejects.toBeInstanceOf(ApiError);
    bindLink();
    await control.run(robot.id, stopCleaning());
    expect(actions).toHaveLength(1);
    expect(writes).toBe(0);
  });

  it('records a new fault of the fault list as an event of the robot', () => {
    hub.start([robot]);
    change(FAULTS, JSON.stringify({ fault: [100008] }));
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      provider: 'xiaomi',
      event: { externalId: IDENTITY.did, kind: 'fault', details: { code: 100008 } },
    });
  });

  it('publishes the active error, keeps an alert out of it and clears it with the fault list', () => {
    hub.start([robot]);
    const faultPushes = (): StateUpdate[] =>
      pushed
        .map((entry) => entry.update)
        .filter((update) => update.capability === VACUUM_FAULT_KEY);
    const settle = (): void => {
      const last = faultPushes().at(-1);
      if (last !== undefined) values.set(VACUUM_FAULT_KEY, last.value);
    };
    change(FAULTS, JSON.stringify({ ts: 1, fault: [100051] }));
    expect(faultPushes()).toHaveLength(0);
    change(FAULTS, JSON.stringify({ ts: 2, fault: [100051, 100006] }));
    settle();
    expect(faultPushes()).toHaveLength(1);
    expect(parseVacuumFault(faultPushes()[0]?.value)).toMatchObject({
      code: 100006,
      title: 'Low battery level',
      canHelp: false,
      since: NOW,
    });
    change(FAULTS, JSON.stringify({ ts: 3, fault: [100051, 100006] }));
    expect(faultPushes()).toHaveLength(1);
    change(FAULTS, JSON.stringify({ ts: 4, fault: [100051] }));
    settle();
    expect(faultPushes()).toHaveLength(2);
    expect(faultPushes()[1]?.value).toBe('');
    expect(parseVacuumFault(faultPushes()[1]?.value)).toBeNull();
  });

  it('publishes an unknown code as a fault without a description and clears a stale stored one on start', () => {
    values.set(VACUUM_FAULT_KEY, '{"code":1,"title":"old","hint":"","canHelp":false}');
    values.set(FAULTS, JSON.stringify({ fault: [0] }));
    hub.start([robot]);
    const cleared = pushed
      .map((entry) => entry.update)
      .filter((u) => u.capability === VACUUM_FAULT_KEY);
    expect(cleared.map((update) => update.value)).toStrictEqual(['']);
    change(FAULTS, JSON.stringify({ fault: [100008] }));
    const last = pushed.at(-1)?.update;
    expect(parseVacuumFault(last?.value)).toMatchObject({
      code: 100008,
      title: 'Fault 100008',
      hint: 'No description from Xiaomi',
    });
  });

  it('does not repeat a fault that is already stored when the hub restarts', () => {
    values.set(FAULTS, JSON.stringify({ fault: [100008] }));
    hub.start([robot]);
    change(FAULTS, JSON.stringify({ fault: [100008] }));
    expect(recorded).toHaveLength(0);
    change(FAULTS, JSON.stringify({ fault: [100008, 100009] }));
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ event: { details: { code: 100009 } } });
  });

  it('closes a live video session before the stop returns, while the link is still bound', async () => {
    bindLink();
    hub.start([robot]);
    viewers.hold('camera:1', [{ target: deviceTarget(robot.id), topic: 'video' }]);
    expect(await hub.routes().video.open(robot.id, { password: '4821', sdp: OFFER })).toMatchObject(
      { status: 'live' },
    );
    actions = [];
    writes = 0;
    await hub.stop();
    expect(actions).toStrictEqual([{ siid: 21, aiid: 4 }]);
    expect(writes).toBe(1);
    expect(streams.at(-1)).toMatch(/^delete vacuum-video-/u);
  });

  it('closes the video session when the last holder of the video demand lets go', async () => {
    bindLink();
    hub.start([robot]);
    viewers.hold('camera:1', [{ target: deviceTarget(robot.id), topic: 'video' }]);
    viewers.hold('camera:2', [{ target: deviceTarget(robot.id), topic: 'video' }]);
    await hub.routes().video.open(robot.id, { password: '4821', sdp: OFFER });
    viewers.release('camera:1');
    await flush();
    expect(streams.at(-1)).toMatch(/^put /u);
    viewers.release('camera:2');
    await flush();
    await flush();
    expect(streams.at(-1)).toMatch(/^delete /u);
  });
});
