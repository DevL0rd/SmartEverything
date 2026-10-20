import {
  ApiError,
  createClientToken,
  hashClientToken,
  BRUSH_VIEW,
  PHONE_BRUSHES,
  TEMPLATE_SCOPES,
  type BrushActionResult,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { homeClock } from '../../../src/local/toothbrush/clock';
import { sonicareDriver } from '../../../src/local/sonicare/driver';
import { brushRoutes, type RouteDeps } from '../../../src/local/toothbrush/routes';
import { sonicareSetup } from '../../../src/local/sonicare/setup';
import { WatchBridges } from '../../../src/local/watch-bridge';
import type { Caller } from '../../../src/server/auth';
import { captureLogs, testLogger } from '../../support/logs';
import {
  ADDRESS,
  dumpOf,
  identityOf,
  lastState,
  sonicareRig,
  word,
  type Person,
  type SonicareRig,
} from '../../support/sonicare-rig';

let rig: SonicareRig;
let routes: ReturnType<typeof brushRoutes>;
let answered: { clientId: string; requestId: string; result: BrushActionResult }[];

beforeEach(async () => {
  captureLogs();
  rig = await sonicareRig();
  answered = [];
  const bridges = new WatchBridges({
    observe: (): Promise<void> => Promise.resolve(),
    now: rig.clock.now,
    log: testLogger('sonicare'),
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
      clock: homeClock(rig.test.store),
      holder: (device) => bridges.holderOf(device),
      series: () => ({ resolution: 'hour', points: [] }),
      now: rig.clock.now,
    },
    acts: {
      store: rig.test.store,
      fleet: rig.fleet,
      local: { observe: (): Promise<void> => Promise.resolve() },
      bridges,
      broker: { run: (): Promise<BrushActionResult> => Promise.resolve({ ok: true, detail: '' }) },
      holderOf: () => null,
      now: rig.clock.now,
      log: testLogger('sonicare'),
    },
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

const LINK = { phase: 'linked', rssi: -50, detail: null };

describe('the phone’s endpoints', () => {
  it('gives every phone the plan and says which one may hold the link', async () => {
    const plans = PHONE_BRUSHES.parse(
      await routes.readPhoneBrushes.run(caller(rig.owner), raw({}), testLogger('x')),
    );
    expect(plans.brushes).toHaveLength(1);
    expect(plans.brushes[0]).toMatchObject({
      holder: true,
      transport: 'gatt',
      brand: 'sonicare',
      bonded: false,
    });
    expect(plans.brushes[0]?.prepare).toHaveLength(1);
    expect(plans.brushes[0]?.subscriptions.length).toBeGreaterThan(10);
  });

  it('makes the first phone that reports the holder and sends the second one away', async () => {
    const batch = {
      frames: [{ at: rig.at(0), characteristic: '2a19', hex: '50' }],
      link: LINK,
    };
    const params = { deviceId: rig.row().id };
    const first = await routes.reportBrushFrames.run(
      caller(rig.owner),
      raw({ params, body: batch }),
      testLogger('x'),
    );
    expect(first).toMatchObject({ live: false, accepted: 1 });
    expect(lastState(rig, 'battery')).toBe(0x50);
    await expect(
      routes.reportBrushFrames.run(
        caller(rig.member),
        raw({ params, body: batch }),
        testLogger('x'),
      ),
    ).rejects.toThrow('Owner phone holds the Bluetooth link');
    const plans = PHONE_BRUSHES.parse(
      await routes.readPhoneBrushes.run(caller(rig.member), raw({}), testLogger('x')),
    );
    expect(plans.brushes[0]?.holder).toBe(false);
  });

  it('passes a phone’s answer to the broker under the phone’s own id', async () => {
    await routes.answerBrushAction.run(
      caller(rig.owner),
      raw({ body: { requestId: 'r1', ok: true, detail: 'Done.' } }),
      testLogger('x'),
    );
    expect(answered).toEqual([
      { clientId: rig.owner.client.id, requestId: 'r1', result: { ok: true, detail: 'Done.' } },
    ]);
  });

  it('hands the next sessions to fetch back with the phone’s own post', async () => {
    const reply = await routes.reportBrushFrames.run(
      caller(rig.owner),
      raw({
        params: { deviceId: rig.row().id },
        body: { frames: [{ at: rig.at(0), characteristic: '40d0', hex: word(3) }], link: LINK },
      }),
      testLogger('x'),
    );
    expect(reply).toMatchObject({
      live: false,
      fetch: [{ sessionId: 3 }, { sessionId: 2 }, { sessionId: 1 }],
      transfer: { completeOn: '477ea600-a260-11e4-ae37-0002a5d54110' },
    });
  });

  it('leaves a toothbrush outside a member’s devices out of the plans for their phone', async () => {
    rig.test.store.personAccess.change(rig.member.profile.id, {
      role: 'member',
      template: 'adult',
      scopes: { ...TEMPLATE_SCOPES.adult, devices: { mode: 'only', rooms: [], devices: [] } },
    });
    const plans = PHONE_BRUSHES.parse(
      await routes.readPhoneBrushes.run(caller(rig.member), raw({}), testLogger('x')),
    );
    expect(plans.brushes).toHaveLength(0);
  });

  it('serves a view to a member and refuses a device that is not a toothbrush', async () => {
    const view = BRUSH_VIEW.parse(
      await routes.readToothbrush.run(
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
      routes.readToothbrush.run(
        caller(rig.owner),
        raw({ params: { deviceId: other?.id }, query: { view: 'state' } }),
        testLogger('x'),
      ),
    ).rejects.toThrow(ApiError);
  });
});

describe('who may reach the toothbrush', () => {
  function desktop(): Caller {
    return {
      kind: 'client',
      client: rig.test.store.clients.create({
        name: 'Desktop',
        platform: 'web',
        role: 'owner',
        tokenHash: hashClientToken(createClientToken()),
        profileId: rig.owner.profile.id,
      }),
    };
  }

  function hideFromMember(): void {
    rig.test.store.personAccess.change(rig.member.profile.id, {
      role: 'member',
      template: 'adult',
      scopes: { ...TEMPLATE_SCOPES.adult, devices: { mode: 'only', rooms: [], devices: [] } },
    });
  }

  const LINKED = { phase: 'linked', rssi: -50, detail: null };

  it('keeps a brush outside a member’s devices from their reads, actions and reports', async () => {
    hideFromMember();
    const params = { deviceId: rig.row().id };
    await expect(
      routes.readToothbrush.run(
        caller(rig.member),
        raw({ params, query: { view: 'state' } }),
        testLogger('x'),
      ),
    ).rejects.toThrow(ApiError);
    await expect(
      routes.actToothbrush.run(
        caller(rig.member),
        raw({ params, body: { action: 'take_over' } }),
        testLogger('x'),
      ),
    ).rejects.toThrow(ApiError);
    await expect(
      routes.reportBrushFrames.run(
        caller(rig.member),
        raw({ params, body: { frames: [], link: LINKED } }),
        testLogger('x'),
      ),
    ).rejects.toThrow(ApiError);
  });

  it('lets only a phone report frames or take the Bluetooth link over', async () => {
    const params = { deviceId: rig.row().id };
    await expect(
      routes.reportBrushFrames.run(
        desktop(),
        raw({ params, body: { frames: [], link: LINKED } }),
        testLogger('x'),
      ),
    ).rejects.toThrow('Only a phone can report');
    await expect(
      routes.actToothbrush.run(
        desktop(),
        raw({ params, body: { action: 'take_over' } }),
        testLogger('x'),
      ),
    ).rejects.toThrow('Only a phone next to the toothbrush can take over');
    await expect(
      routes.actToothbrush.run(
        caller(rig.owner),
        raw({ params, body: { action: 'take_over' } }),
        testLogger('x'),
      ),
    ).resolves.toMatchObject({ ok: true });
  });
});

describe('adding a toothbrush', () => {
  const setup = {
    driver: 'philips_sonicare',
    source: 'bluetooth',
    name: 'Bathroom brush',
    address: ADDRESS,
    room: 'Bathroom',
    profileId: null,
    modelKey: null,
    bonded: false,
    gatt: dumpOf(identityOf()),
  } as const;

  it('keeps the identity, the room and the person and names the model after the handle', () => {
    const resolved = sonicareSetup({ ...setup, profileId: rig.owner.profile.id });
    expect(resolved.key).toBeNull();
    expect(resolved.entry).toMatchObject({
      externalId: 'philips_sonicare:0143C5C968',
      driver: 'philips_sonicare',
      address: ADDRESS,
      config: {
        model: 'philips.toothbrush.hx992x',
        room: 'Bathroom',
        identity: { model: 'HX992X', stack: 'classic', bonded: false },
        settings: { personId: rig.owner.profile.id, model: null },
      },
    });
  });

  it('applies a model the person picked when the handle named none', () => {
    const nameless = identityOf({ model: null, serial: null, stack: 'condor', bonded: true });
    const resolved = sonicareSetup({
      ...setup,
      modelKey: 'hx6600',
      bonded: true,
      gatt: dumpOf(nameless),
    });
    expect(resolved.entry.config['model']).toBe('philips.toothbrush.hx6600');
    expect(resolved.entry.externalId).toBe(`philips_sonicare:${ADDRESS}`);
  });

  it('refuses a model that is not in the list and a device that is not a toothbrush', () => {
    expect(() => sonicareSetup({ ...setup, modelKey: 'hx0000' })).toThrow('no toothbrush model');
    expect(() =>
      sonicareSetup({
        ...setup,
        gatt: { name: 'Lamp', services: [{ uuid: '180f', characteristics: [] }] },
      }),
    ).toThrow('neither the Sonicare service');
  });
});

describe('how the toothbrush appears in the home', () => {
  it('is offline until a phone reports the link and carries the capabilities of its profile', () => {
    const [entry] = rig.test.store.localDevices.list();
    if (entry === undefined) {
      throw new Error('the entry is missing');
    }
    const offline = sonicareDriver.describe(entry, {});
    expect(offline).toMatchObject({ online: false, kind: 'other', manufacturer: 'philips' });
    const keys = offline?.capabilities.map((capability) => capability.key) ?? [];
    expect(keys).toContain('brush_head_wear');
    expect(keys).not.toContain('brush_pressure');
    expect(keys).not.toContain('brush_streak_days');
    expect(keys).not.toContain('brush_goal_today');
    expect(keys).not.toContain('brush_last_session_at');
    expect(keys).not.toContain('brush_feedback_pressure');
    const mode = offline?.capabilities.find((capability) => capability.key === 'brush_mode');
    expect(mode).toMatchObject({
      access: 'read',
      value: { kind: 'enum', options: ['clean', 'white_plus', 'gum_health', 'deep_clean_plus'] },
    });
    expect(sonicareDriver.describe(entry, { linkPhase: 'linked' })?.online).toBe(true);
  });
});
