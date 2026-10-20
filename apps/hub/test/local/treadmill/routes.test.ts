import {
  ApiError,
  PHONE_TREADMILLS,
  TEMPLATE_SCOPES,
  TREADMILL_VIEW,
  type TreadmillActionResult,
} from '@smarteverything/domain';
import type { LocalDeviceEntry } from '../../../src/store/repositories/local-devices';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Caller } from '../../../src/server/auth';
import { entryConfigOf, identityOfDevice } from '../../../src/local/treadmill/config';
import { TreadmillHealth } from '../../../src/local/treadmill/health';
import { kingsmithTreadmillDriver } from '../../../src/local/treadmill/driver';
import { treadmillRoutes, type RouteDeps } from '../../../src/local/treadmill/routes';
import { treadmillSetup } from '../../../src/local/treadmill/setup';
import { WatchBridges } from '../../../src/local/watch-bridge';
import { captureLogs, testLogger } from '../../support/logs';
import {
  ADDRESS,
  FTMS_GATT,
  IDLE,
  WILINK_GATT,
  statusHex,
  treadmillRig,
  type Person,
  type TreadmillRig,
} from '../../support/treadmill-rig';

let rig: TreadmillRig;
let routes: ReturnType<typeof treadmillRoutes>;
let answered: { clientId: string; requestId: string; result: TreadmillActionResult }[];

beforeEach(async () => {
  captureLogs();
  rig = await treadmillRig();
  answered = [];
  const bridges = new WatchBridges({
    observe: (): Promise<void> => Promise.resolve(),
    now: rig.clock.now,
    log: testLogger('treadmill'),
  });
  const deps: RouteDeps = {
    store: rig.test.store,
    fleet: rig.fleet,
    local: { deviceOf: () => rig.row() },
    bridges,
    ingest: rig.ingest,
    broker: {
      answer: (clientId, requestId, result): void => {
        answered.push({ clientId, requestId, result });
      },
    },
    views: {
      store: rig.test.store,
      fleet: rig.fleet,
      holder: (device) => bridges.holderOf(device),
      walkerOf: (device) => rig.ingest.walkerFacts(device),
      series: () => ({ resolution: 'second', points: [] }),
      now: rig.clock.now,
    },
    acts: {
      store: rig.test.store,
      fleet: rig.fleet,
      local: { observe: (): Promise<void> => Promise.resolve() },
      bridges,
      health: new TreadmillHealth(rig.test.store),
      broker: { run: () => Promise.resolve({ ok: true, detail: 'Done.' }) },
      holderOf: () => null,
      now: rig.clock.now,
      log: testLogger('treadmill'),
    },
    afterReport: () => undefined,
    now: rig.clock.now,
  };
  routes = treadmillRoutes(deps);
});

afterEach(async () => {
  await rig.close();
});

function caller(person: Person): Caller {
  return { kind: 'client', client: rig.test.store.clients.byId(person.client.id) };
}

describe('the phone’s endpoints', () => {
  it('gives every phone the plan and says which one may hold the link', async () => {
    const plans = PHONE_TREADMILLS.parse(
      await routes.readPhoneTreadmills.run(caller(rig.owner), raw({}), testLogger('x')),
    );
    expect(plans.treadmills).toHaveLength(1);
    expect(plans.treadmills[0]).toMatchObject({
      holder: true,
      family: 'wilink',
      deviceId: rig.row().id,
    });
  });

  it('makes the first phone that reports the holder and sends the second one away', async () => {
    const batch = {
      frames: [
        { at: '2026-10-18T10:00:00.000Z', characteristic: 'fe01', hex: statusHex({ state: IDLE }) },
      ],
      link: { phase: 'linked', rssi: -50, reconnects: 0, detail: null },
    };
    const first = await routes.reportTreadmillFrames.run(
      caller(rig.owner),
      raw({ params: { deviceId: rig.row().id }, body: batch }),
      testLogger('x'),
    );
    expect(first).toEqual({ live: false, accepted: 1 });
    await expect(
      routes.reportTreadmillFrames.run(
        caller(rig.member),
        raw({ params: { deviceId: rig.row().id }, body: batch }),
        testLogger('x'),
      ),
    ).rejects.toThrow('Owner phone holds the Bluetooth link');
    const plans = PHONE_TREADMILLS.parse(
      await routes.readPhoneTreadmills.run(caller(rig.member), raw({}), testLogger('x')),
    );
    expect(plans.treadmills[0]?.holder).toBe(false);
  });

  it('passes a phone’s answer to the broker under the phone’s own id', async () => {
    await routes.answerTreadmillAction.run(
      caller(rig.owner),
      raw({ body: { requestId: 'r1', ok: true, detail: 'Done.' } }),
      testLogger('x'),
    );
    expect(answered).toEqual([
      { clientId: rig.owner.client.id, requestId: 'r1', result: { ok: true, detail: 'Done.' } },
    ]);
  });

  it('keeps a treadmill outside a member’s devices from their reads, actions and frames', async () => {
    rig.test.store.personAccess.change(rig.member.profile.id, {
      role: 'member',
      template: 'adult',
      scopes: { ...TEMPLATE_SCOPES.adult, devices: { mode: 'only', rooms: [], devices: [] } },
    });
    const params = { deviceId: rig.row().id };
    const hidden = 'That device is not part of your access';
    await expect(
      routes.readTreadmill.run(
        caller(rig.member),
        raw({ params, query: { view: 'state' } }),
        testLogger('x'),
      ),
    ).rejects.toThrow(hidden);
    await expect(
      routes.actTreadmill.run(
        caller(rig.member),
        raw({ params, body: { action: 'set_walker', personId: rig.member.profile.id } }),
        testLogger('x'),
      ),
    ).rejects.toThrow(hidden);
    await expect(
      routes.reportTreadmillFrames.run(
        caller(rig.member),
        raw({
          params,
          body: { frames: [], link: { phase: 'linked', rssi: -50, reconnects: 0, detail: null } },
        }),
        testLogger('x'),
      ),
    ).rejects.toThrow(hidden);
    const plans = PHONE_TREADMILLS.parse(
      await routes.readPhoneTreadmills.run(caller(rig.member), raw({}), testLogger('x')),
    );
    expect(plans.treadmills).toHaveLength(0);
  });

  it('serves a view to a member and refuses a device that is not a treadmill', async () => {
    const view = TREADMILL_VIEW.parse(
      await routes.readTreadmill.run(
        caller(rig.member),
        raw({ params: { deviceId: rig.row().id }, query: { view: 'settings' } }),
        testLogger('x'),
      ),
    );
    expect(view.view === 'settings' ? view.settings : 'x').toBeNull();
    const [other] = rig.test.store.devices.upsert([
      {
        provider: 'local',
        externalId: 'other:1',
        parentId: null,
        kind: 'sensor',
        name: 'Lamp',
        model: 'x',
        manufacturer: 'x',
        providerRoom: null,
        roomId: null,
        online: true,
        capabilities: [],
        details: {},
      },
    ]);
    await expect(
      routes.readTreadmill.run(
        caller(rig.owner),
        raw({ params: { deviceId: other?.id }, query: { view: 'state' } }),
        testLogger('x'),
      ),
    ).rejects.toThrow(ApiError);
  });
});

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

describe('adding a treadmill', () => {
  it('reads the model from the dump and keeps the family, the dump and the room', () => {
    const resolved = treadmillSetup({
      driver: 'kingsmith_treadmill',
      source: 'bluetooth',
      name: 'Walking pad',
      address: ADDRESS,
      room: 'Study',
      gatt: WILINK_GATT,
    });
    expect(resolved.key).toBeNull();
    expect(resolved.replaces).toBeNull();
    expect(resolved.entry).toMatchObject({
      externalId: `kingsmith_treadmill:${ADDRESS}`,
      driver: 'kingsmith_treadmill',
      config: { model: 'kingsmith.treadmill.k15', room: 'Study', family: 'wilink' },
    });
  });

  it('falls back to an unknown model when the dump names no model and reads the speed range of a standard belt', () => {
    const resolved = treadmillSetup({
      driver: 'kingsmith_treadmill',
      source: 'bluetooth',
      name: 'Pad',
      address: ADDRESS,
      room: null,
      gatt: FTMS_GATT,
    });
    expect(resolved.entry.config['model']).toBe('kingsmith.treadmill.unknown');
    expect(
      identityOfDevice(entryConfigOf({ ...resolved.entry, createdAt: '' }).gatt, undefined),
    ).toMatchObject({
      speedMinKmh: 0.8,
      speedMaxKmh: 15,
    });
  });

  it('refuses a device that is not a treadmill and says what it found', () => {
    expect(() =>
      treadmillSetup({
        driver: 'kingsmith_treadmill',
        source: 'bluetooth',
        name: 'Lamp',
        address: ADDRESS,
        room: null,
        gatt: { name: 'Lamp', services: [{ uuid: '180f', characteristics: [] }] },
      }),
    ).toThrow('found 180f');
  });
});

describe('how the treadmill appears in the home', () => {
  const entry = (): LocalDeviceEntry => {
    const [first] = rig.test.store.localDevices.list();
    if (first === undefined) {
      throw new Error('the treadmill entry is missing');
    }
    return first;
  };

  it('is offline until a phone reports the link and online once it does', () => {
    const offline = kingsmithTreadmillDriver.describe(entry(), {});
    expect(offline?.online).toBe(false);
    expect(offline?.kind).toBe('appliance');
    expect(offline?.manufacturer).toBe('kingsmith');
    const online = kingsmithTreadmillDriver.describe(entry(), { linkPhase: 'linked' });
    expect(online?.online).toBe(true);
    expect(online?.details['linkPhase']).toBe('linked');
  });

  it('offers the controls the family has and nothing else', () => {
    const keys = (family: 'wilink' | 'ftms'): string[] => {
      const base = entry();
      const device = kingsmithTreadmillDriver.describe(
        { ...base, config: { ...base.config, family } },
        {},
      );
      return device?.capabilities.map((capability) => capability.key) ?? [];
    };
    expect(keys('wilink')).toEqual(
      expect.arrayContaining([
        'belt_command',
        'belt_speed',
        'belt_goal',
        'child_lock',
        'belt_sensitivity',
      ]),
    );
    expect(keys('ftms')).not.toContain('child_lock');
    expect(keys('ftms')).toContain('belt_state');
  });

  it('keeps the bridge holder in the details so the next report can find it', () => {
    const bridge = {
      clientId: rig.owner.client.id,
      clientName: 'Owner phone',
      since: '2026-10-18T10:00:00.000Z',
    };
    expect(kingsmithTreadmillDriver.describe(entry(), { bridge })?.details['bridge']).toEqual(
      bridge,
    );
  });
});
