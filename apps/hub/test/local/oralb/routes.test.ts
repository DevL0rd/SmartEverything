import {
  BRUSH_FRAME_BATCH,
  BRUSH_VIEW,
  PHONE_BRUSHES,
  type BrushActionResult,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { homeClock } from '../../../src/local/toothbrush/clock';
import { brushRoutes, type RouteDeps } from '../../../src/local/toothbrush/routes';
import { WatchBridges } from '../../../src/local/watch-bridge';
import type { Caller } from '../../../src/server/auth';
import { captureLogs, testLogger } from '../../support/logs';
import { bytes, lastState, oralbRig, type OralbRig, type Person } from './rig';

let rig: OralbRig;
let routes: ReturnType<typeof brushRoutes>;
let answered: BrushActionResult[];

beforeEach(async () => {
  captureLogs();
  rig = await oralbRig({ settings: { consent: true } });
  answered = [];
  const bridges = new WatchBridges({
    observe: (): Promise<void> => Promise.resolve(),
    now: rig.clock.now,
    log: testLogger('oralb'),
  });
  const deps: RouteDeps = {
    store: rig.test.store,
    fleet: rig.fleet,
    local: { deviceOf: () => rig.row() },
    bridges,
    ingest: rig.ingest,
    broker: {
      answer: (_clientId, _requestId, result): void => {
        answered.push(result);
      },
    },
    views: {
      store: rig.test.store,
      fleet: rig.fleet,
      clock: homeClock(rig.test.store),
      holder: (device) => bridges.holderOf(device),
      series: () => ({ resolution: 'hour', points: [] }),
      now: rig.clock.now,
    },
    acts: { ...rig.acts(), bridges },
    now: rig.clock.now,
  };
  routes = brushRoutes(deps);
});

afterEach(async () => {
  await rig.close();
});

function caller(person: Person): Caller {
  return { kind: 'client', client: rig.test.store.clients.byId(person.client.id) };
}

function raw(parts: { params?: unknown; query?: unknown; body?: unknown }): {
  params: unknown;
  query: unknown;
  body: unknown;
  remote: string;
} {
  return {
    params: parts.params ?? {},
    query: parts.query ?? {},
    body: parts.body,
    remote: '127.0.0.1',
  };
}

describe('the phone’s endpoints for an Oral-B brush', () => {
  it('gives the phone a plan that listens to adverts and reads without writing', async () => {
    const plans = PHONE_BRUSHES.parse(
      await routes.readPhoneBrushes.run(caller(rig.owner), raw({}), testLogger('x')),
    );
    expect(plans.brushes).toHaveLength(1);
    const [plan] = plans.brushes;
    expect(plan).toMatchObject({
      holder: true,
      transport: 'gatt',
      brand: 'oralb',
      bonded: false,
      adverts: { companyId: 220 },
      prepare: [],
      subscriptions: [],
      initial: [],
    });
    const reads = plan?.reads.map((read) => read.characteristic.slice(4, 8)) ?? [];
    expect(reads).toEqual([
      'ff02',
      'ff04',
      'ff05',
      'ff07',
      'ff22',
      'ff25',
      'ff26',
      'ff2b',
      'ff2d',
      'ff29',
      'ff0a',
    ]);
    expect(plan?.sync.map((read) => read.characteristic.slice(4, 8))).toEqual([
      'ff05',
      'ff0a',
      'ff22',
      'ff29',
      'ff2d',
    ]);
    expect([
      ...reads,
      ...(plan?.sync ?? []).map((read) => read.characteristic.slice(4, 8)),
    ]).not.toContain('ff0c');
  });

  it('subscribes only for a brush that is armed or set to connected live', async () => {
    rig.test.store.localDevices.updateConfig(rig.device.external_id, {
      ...rig.test.store.localDevices.byExternalId(rig.device.external_id).config,
      settings: { policy: 'armed' },
    });
    rig.fleet.refresh(rig.row());
    const plans = PHONE_BRUSHES.parse(
      await routes.readPhoneBrushes.run(caller(rig.owner), raw({}), testLogger('x')),
    );
    expect(plans.brushes[0]?.subscriptions.map((item) => item.characteristic.slice(4, 8))).toEqual([
      'ff04',
      'ff07',
      'ff08',
      'ff09',
      'ff0a',
      'ff0b',
      'ff05',
    ]);
  });

  it('takes adverts and frames in one batch from the holder and answers the live flag', async () => {
    const batch = BRUSH_FRAME_BATCH.parse({
      frames: [
        {
          at: rig.at(0),
          characteristic: rig.frame('ff05', bytes(70), 0).characteristic,
          hex: bytes(70),
        },
      ],
      adverts: [rig.advert(0, { state: 2, mode: 3 })],
      link: { phase: 'asleep', rssi: -60, detail: null },
    });
    const first = await routes.reportBrushFrames.run(
      caller(rig.owner),
      raw({ params: { deviceId: rig.row().id }, body: batch }),
      testLogger('x'),
    );
    expect(first).toMatchObject({ live: false, accepted: 1, fetch: [], transfer: null });
    expect(lastState(rig, 'battery')).toBe(70);
    expect(lastState(rig, 'brush_mode')).toBe('whiten');
  });

  it('reads the state view and lets only the owner act on it', async () => {
    const view = BRUSH_VIEW.parse(
      await routes.readToothbrush.run(
        caller(rig.owner),
        raw({ params: { deviceId: rig.row().id }, query: { view: 'state' } }),
        testLogger('x'),
      ),
    );
    expect(view).toMatchObject({ view: 'state', profile: { brand: 'oralb' } });
    await expect(
      routes.actToothbrush.run(
        caller(rig.member),
        raw({ params: { deviceId: rig.row().id }, body: { action: 'probe', probe: 'advert_log' } }),
        testLogger('x'),
      ),
    ).rejects.toThrow('Only the owner');
    const result = await routes.actToothbrush.run(
      caller(rig.owner),
      raw({ params: { deviceId: rig.row().id }, body: { action: 'probe', probe: 'advert_log' } }),
      testLogger('x'),
    );
    expect(result).toMatchObject({ ok: false });
  });
});
