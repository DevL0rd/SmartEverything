import type { JsonValue } from '@smarteverything/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  EMPTY_ROUTE,
  ROUTE_INTERVAL_MS,
  RouteInputError,
  VacuumLiveRoute,
  routeRequest,
  type LiveRouteUpdate,
  type RouteIo,
} from '../../src/vacuum/live-route';
import { captureLogs, testLogger, type CapturedLogs } from '../support/logs';
import { FakeRouteTimer, flush } from '../support/route-timer';

const ROBOT = 'robot';
const ADDRESS = { siid: 2, aiid: 47 };

interface Call {
  readonly address: { readonly siid: number; readonly aiid: number };
  readonly inputs: readonly JsonValue[];
}

function point(poseId: number): Record<string, number> {
  return {
    x: 1000 + poseId * 10,
    y: -500 + poseId * 5,
    type: 1,
    pose_id: poseId,
    sweep_mop_mode: 1,
    yaw: 1500,
  };
}

function answer(from: number, count: number): JsonValue {
  const points = Array.from({ length: count }, (_, index) => point(from + index));
  return [{ piid: 24, value: JSON.stringify({ points }) }];
}

let logs: CapturedLogs;
let timer: FakeRouteTimer;
let calls: Call[];
let replies: (() => Promise<JsonValue>)[];
let transport: RouteIo['transport'];
let updates: LiveRouteUpdate[];
let route: VacuumLiveRoute;
let inFlight: number;
let maxInFlight: number;

function reply(value: JsonValue): void {
  replies.push(() => Promise.resolve(value));
}

function io(): RouteIo {
  return {
    transport,
    action: async (address, inputs): Promise<JsonValue> => {
      calls.push({ address, inputs });
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        const next = replies.shift();
        return next === undefined ? answer(0, 0) : await next();
      } finally {
        inFlight -= 1;
      }
    },
  };
}

beforeEach(() => {
  logs = captureLogs();
  timer = new FakeRouteTimer();
  calls = [];
  replies = [];
  updates = [];
  transport = 'lan';
  inFlight = 0;
  maxInFlight = 0;
  route = new VacuumLiveRoute({
    io: (): RouteIo => io(),
    timer,
    changed: (_deviceId, update): void => {
      updates.push(update);
    },
    log: testLogger('route'),
  });
});

describe('the A2.47 request', () => {
  it('is the piid-tagged pose id object on action 2.47', async () => {
    route.start(ROBOT);
    await timer.fire();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.address).toEqual(ADDRESS);
    expect(calls[0]?.inputs).toEqual([{ piid: 24, value: '{"pose_id":0}' }]);
  });

  it('refuses anything but a non-negative integer pose id', () => {
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => routeRequest(bad)).toThrow(RouteInputError);
    }
    expect(routeRequest(7)).toEqual([{ piid: 24, value: '{"pose_id":7}' }]);
  });
});

describe('the live route cadence', () => {
  it('makes no call and arms no timer until it is started', async () => {
    await flush();
    expect(timer.armed()).toBe(0);
    expect(calls).toHaveLength(0);
    expect(route.active(ROBOT)).toBe(false);
  });

  it('asks once per interval and publishes the pose in metres', async () => {
    route.start(ROBOT);
    expect(timer.lastDelay()).toBe(ROUTE_INTERVAL_MS);
    reply(answer(0, 3));
    await timer.fire();
    expect(updates).toHaveLength(1);
    expect(updates[0]?.route.cursor).toBe(3);
    expect(updates[0]?.pose).toEqual({ x: 1.02, y: -0.49, yaw: 1.5 });
    expect(timer.lastDelay()).toBe(ROUTE_INTERVAL_MS);
    reply(answer(3, 2));
    await timer.fire();
    expect(calls.map((call) => call.inputs)).toEqual([
      [{ piid: 24, value: '{"pose_id":0}' }],
      [{ piid: 24, value: '{"pose_id":3}' }],
    ]);
    expect(route.route(ROBOT)?.cursor).toBe(5);
  });

  it('asks for the next page at once while the answer is a full page', async () => {
    route.start(ROBOT);
    reply(answer(0, 10));
    reply(answer(10, 4));
    await timer.fire();
    expect(calls.map((call) => call.inputs)).toEqual([
      [{ piid: 24, value: '{"pose_id":0}' }],
      [{ piid: 24, value: '{"pose_id":10}' }],
    ]);
    expect(route.route(ROBOT)?.cursor).toBe(14);
    expect(timer.armed()).toBe(1);
  });

  it('never has two calls in flight', async () => {
    route.start(ROBOT);
    route.start(ROBOT);
    reply(answer(0, 10));
    reply(answer(10, 1));
    await timer.fire();
    expect(maxInFlight).toBe(1);
    expect(timer.armed()).toBe(1);
  });

  it('treats the NULL answer and an empty list as no new points', async () => {
    route.start(ROBOT);
    reply([{ piid: 24, value: 'NULL' }]);
    await timer.fire();
    reply(answer(0, 0));
    await timer.fire();
    expect(updates).toHaveLength(0);
    expect(route.active(ROBOT)).toBe(true);
    expect(timer.armed()).toBe(1);
  });
});

describe('stopping', () => {
  it('cancels the pending call at once and makes no further call', async () => {
    route.start(ROBOT);
    route.stop(ROBOT);
    expect(timer.armed()).toBe(0);
    await timer.fireCancelled();
    expect(calls).toHaveLength(0);
    expect(route.active(ROBOT)).toBe(false);
  });

  it('drops the answer of a call that was in flight and arms nothing', async () => {
    route.start(ROBOT);
    let release: (value: JsonValue) => void = () => undefined;
    replies.push(
      () =>
        new Promise<JsonValue>((resolve) => {
          release = resolve;
        }),
    );
    const firing = timer.fire();
    await flush();
    route.stop(ROBOT);
    release(answer(0, 4));
    await firing;
    await flush();
    expect(updates).toHaveLength(0);
    expect(timer.armed()).toBe(0);
  });

  it('keeps one chain when restarted while a call is in flight', async () => {
    route.start(ROBOT);
    let release: (value: JsonValue) => void = () => undefined;
    replies.push(
      () =>
        new Promise<JsonValue>((resolve) => {
          release = resolve;
        }),
    );
    const firing = timer.fire();
    await flush();
    route.stop(ROBOT);
    route.start(ROBOT);
    expect(timer.armed()).toBe(0);
    release(answer(0, 4));
    await firing;
    await flush();
    expect(timer.armed()).toBe(1);
    expect(updates).toHaveLength(1);
  });

  it('stops without a call when the device has no LAN session', async () => {
    transport = 'cloud';
    route.start(ROBOT);
    await timer.fire();
    expect(calls).toHaveLength(0);
    expect(route.active(ROBOT)).toBe(false);
    expect(timer.armed()).toBe(0);
    expect(logs.events()).toContain('vacuum_route.no_lan');
  });
});

describe('route state', () => {
  it('reset clears the trail, tells the consumer and restarts from pose 0', async () => {
    route.start(ROBOT);
    reply(answer(0, 5));
    await timer.fire();
    route.reset(ROBOT);
    expect(updates.at(-1)).toEqual({ route: EMPTY_ROUTE, pose: null });
    expect(route.route(ROBOT)).toBeNull();
    await timer.fire();
    expect(calls.at(-1)?.inputs).toEqual([{ piid: 24, value: '{"pose_id":0}' }]);
  });

  it('drops an answer that was requested before a reset', async () => {
    route.start(ROBOT);
    reply(answer(0, 5));
    await timer.fire();
    let release: (value: JsonValue) => void = () => undefined;
    replies.push(
      () =>
        new Promise<JsonValue>((resolve) => {
          release = resolve;
        }),
    );
    const firing = timer.fire();
    await flush();
    route.reset(ROBOT);
    release(answer(5, 3));
    await firing;
    expect(route.route(ROBOT)).toBeNull();
  });

  it('restarts from 0 and logs when the robot answers from another pose id', async () => {
    route.start(ROBOT);
    reply(answer(0, 3));
    await timer.fire();
    reply(answer(7, 2));
    await timer.fire();
    expect(logs.events()).toContain('vacuum_route.gap');
    expect(route.route(ROBOT)).toBeNull();
    reply(answer(0, 2));
    await timer.fire();
    expect(calls.at(-1)?.inputs).toEqual([{ piid: 24, value: '{"pose_id":0}' }]);
    expect(route.route(ROBOT)?.cursor).toBe(2);
  });

  it('logs a failing call once, keeps polling and logs the recovery', async () => {
    route.start(ROBOT);
    replies.push(() => Promise.reject(new Error('timeout')));
    replies.push(() => Promise.reject(new Error('timeout')));
    await timer.fire();
    await timer.fire();
    expect(logs.events().filter((event) => event === 'vacuum_route.failed')).toHaveLength(1);
    expect(route.active(ROBOT)).toBe(true);
    reply(answer(0, 1));
    await timer.fire();
    expect(logs.events()).toContain('vacuum_route.recovered');
    expect(updates).toHaveLength(1);
  });
});
