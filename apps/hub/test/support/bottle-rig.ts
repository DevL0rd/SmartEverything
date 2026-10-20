import type { TRIGGER_TYPES } from '@smarteverything/ble';
import { z } from 'zod';
import {
  PUSH_PAYLOAD_KEY,
  TEMPLATE_SCOPES,
  createClientToken,
  hashClientToken,
  type AdapterSink,
  type BottleSyncResult,
  type ClientRow,
  type DeviceEvent,
  type DeviceRow,
  type JsonValue,
  type ProfileRow,
  type StateUpdate,
  type WatchBridge,
} from '@smarteverything/domain';
import { PushCommandChannel, type PushCommandOutcome } from '../../src/extensions/push/commands';
import { actBottle, type ActDeps, type Actor } from '../../src/local/bottle/acts';
import { BottleActions } from '../../src/local/bottle/actions';
import { BottleActionBroker } from '../../src/local/bottle/broker';
import { BOTTLE_ENTRY_CONFIG } from '../../src/local/bottle/config';
import { homeClock } from '../../src/local/bottle/clock';
import { BOTTLE_CAPABILITIES } from '../../src/local/bottle/capabilities';
import { bottleSetup } from '../../src/local/bottle/setup';
import { BottleIngest, planDepsOf, type IngestDeps } from '../../src/local/bottle/ingest';
import { syncPlanOf } from '../../src/local/bottle/plan';
import { Snapshots } from '../../src/local/bottle/snapshots';
import type { ViewDeps } from '../../src/local/bottle/view-deps';
import { StatsCache } from '../../src/local/bottle/views-stats';
import { FakeCap } from './fake-cap';
import { runPlan } from './fake-phone';
import { FakeClock } from './fake-clock';
import { testLogger } from './logs';
import { testStore, type TestStore } from './store';

const PAYLOAD = z.record(z.string(), z.unknown());

export const START = '2026-10-18T12:00:00.000Z';

export const SERIAL = '0123456789ABCDEF';

export interface Person {
  readonly profile: ProfileRow;
  readonly client: ClientRow;
}

export interface BottleRig {
  readonly test: TestStore;
  readonly clock: FakeClock;
  readonly owner: Person;
  readonly member: Person;
  readonly device: DeviceRow;
  readonly cap: FakeCap;
  readonly states: StateUpdate[];
  readonly events: DeviceEvent[];
  readonly observed: Record<string, JsonValue>[];
  readonly bridge: { holder: WatchBridge | null };
  readonly pushes: { clientId: string; payload: Record<string, unknown> }[];
  readonly broker: BottleActionBroker;
  readonly actions: BottleActions;
  readonly ingest: BottleIngest;
  readonly ingestDeps: IngestDeps;
  readonly views: ViewDeps;
  readonly acts: ActDeps;
  readonly stats: StatsCache;
  readonly snapshots: Snapshots;
  readonly sync: (
    minutes?: number,
    by?: Person,
    trigger?: 'wake' | 'action',
  ) => Promise<BottleSyncResult>;
  readonly act: (
    by: Person,
    action: Parameters<typeof actBottle>[3],
  ) => ReturnType<typeof actBottle>;
  readonly row: () => DeviceRow;
  readonly entry: () => ReturnType<TestStore['store']['localDevices']['byExternalId']>;
  readonly seconds: (minutesFromStart: number) => number;
  readonly close: () => Promise<void>;
}

function personOf(
  test: TestStore,
  name: string,
  role: 'owner' | 'member',
  profile: ProfileRow,
): Person {
  const client = test.store.clients.create({
    name: `${name} phone`,
    platform: 'android',
    role,
    tokenHash: hashClientToken(createClientToken()),
    profileId: profile.id,
  });
  return { profile, client };
}

export function seedDevice(
  test: TestStore,
  profileId: string | null,
  now: Date,
): { device: DeviceRow; externalId: string } {
  const setup = bottleSetup(
    {
      driver: 'larq_bottle',
      source: 'bluetooth',
      name: 'Kitchen bottle',
      serial: SERIAL,
      room: null,
      profileId,
      body: 680,
      filter: false,
      dis: null,
    },
    { now, today: '2026-10-18' },
  );
  test.store.localDevices.add(setup.entry);
  const [stored] = test.store.devices.upsert([
    {
      provider: 'local',
      externalId: setup.entry.externalId,
      parentId: null,
      kind: 'other',
      name: 'Kitchen bottle',
      model: BOTTLE_ENTRY_CONFIG.parse(setup.entry.config).model,
      manufacturer: 'larq',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [...BOTTLE_CAPABILITIES],
      details: {},
    },
  ]);
  if (stored === undefined) {
    throw new Error('the bottle was not stored');
  }
  return { device: stored, externalId: setup.entry.externalId };
}

export function tofRow(
  at: number,
  distanceMm: number,
  trigger: (typeof TRIGGER_TYPES)[number] = 'cap',
  kcps = 6000,
): { at: number; trigger: string; distanceMm: number; kcps: number; ledOhm: number } {
  return { at, trigger, distanceMm, kcps, ledOhm: 10_000 };
}

class Capture {
  readonly states: StateUpdate[] = [];
  readonly events: DeviceEvent[] = [];
  readonly observed: Record<string, JsonValue>[] = [];
  readonly pushes: BottleRig['pushes'] = [];

  readonly sink: AdapterSink = {
    state: (update): void => {
      this.states.push(update);
    },
    event: (event): void => {
      this.events.push(event);
    },
    online: (): void => undefined,
    devices: (): void => undefined,
    failure: (): void => undefined,
  };

  readonly channel = new PushCommandChannel();

  constructor() {
    this.channel.attach((clientId, data): Promise<PushCommandOutcome> => {
      this.pushes.push({
        clientId,
        payload: PAYLOAD.parse(JSON.parse(data[PUSH_PAYLOAD_KEY] ?? '{}')),
      });
      return Promise.resolve({ outcome: 'sent' });
    });
  }
}

interface Seeded {
  readonly clock: FakeClock;
  readonly test: TestStore;
  readonly owner: Person;
  readonly member: Person;
  readonly device: DeviceRow;
}

async function seed(bound: 'owner' | 'member' | null): Promise<Seeded> {
  const clock = new FakeClock(START);
  const test = await testStore(clock.now);
  const owner = personOf(test, 'Owner', 'owner', test.store.profiles.first());
  const member = personOf(test, 'Ida', 'member', test.store.profiles.create({ name: 'Ida' }));
  test.store.personAccess.change(member.profile.id, {
    role: 'member',
    template: 'adult',
    scopes: TEMPLATE_SCOPES.adult,
  });
  const profile = { owner: owner.profile.id, member: member.profile.id, none: null };
  const profileId = bound === null ? profile.none : profile[bound];
  return { clock, test, owner, member, device: seedDevice(test, profileId, clock.now()).device };
}

interface Parts {
  readonly ingestDeps: IngestDeps;
  readonly broker: BottleActionBroker;
  readonly actions: BottleActions;
  readonly views: ViewDeps;
  readonly acts: ActDeps;
  readonly snapshots: Snapshots;
  readonly stats: StatsCache;
}

function partsOf(seeded: Seeded, capture: Capture, bridge: BottleRig['bridge']): Parts {
  const { test, clock } = seeded;
  const log = testLogger('bottle');
  const snapshots = new Snapshots(test.store.bottleLogs);
  const stats = new StatsCache();
  const local = {
    observe: (_id: string, values: Readonly<Record<string, JsonValue>>): Promise<void> => {
      capture.observed.push({ ...values });
      return Promise.resolve();
    },
  };
  const ingestDeps: IngestDeps = {
    store: test.store,
    readings: test.store.bottleReadings,
    logs: test.store.bottleLogs,
    snapshots,
    sink: (): AdapterSink => capture.sink,
    local,
    clock: homeClock(test.store),
    now: clock.now,
    log,
  };
  const broker = new BottleActionBroker(capture.channel, log);
  const actions = new BottleActions({
    store: test.store,
    broker,
    bridges: { holderOf: (): WatchBridge | null => bridge.holder },
    plan: planDepsOf(ingestDeps),
  });
  const shared = { ingestDeps, snapshots, stats, local, actions, bridge, seeded };
  return {
    ingestDeps,
    broker,
    actions,
    snapshots,
    stats,
    views: viewsOf(shared),
    acts: actsOf(shared),
  };
}

interface Shared {
  readonly ingestDeps: IngestDeps;
  readonly snapshots: Snapshots;
  readonly stats: StatsCache;
  readonly local: ActDeps['local'];
  readonly actions: BottleActions;
  readonly bridge: BottleRig['bridge'];
  readonly seeded: Seeded;
}

function viewsOf(shared: Shared): ViewDeps {
  const { test, clock } = shared.seeded;
  return {
    store: test.store,
    readings: test.store.bottleReadings,
    logs: test.store.bottleLogs,
    snapshots: shared.snapshots,
    clock: shared.ingestDeps.clock,
    now: clock.now,
    holder: (): WatchBridge | null => shared.bridge.holder,
    syncing: (): boolean => false,
    stats: shared.stats,
  };
}

function actsOf(shared: Shared): ActDeps {
  const { test, clock } = shared.seeded;
  return {
    store: test.store,
    readings: test.store.bottleReadings,
    snapshots: shared.snapshots,
    drinks: {
      store: test.store,
      readings: test.store.bottleReadings,
      clock: shared.ingestDeps.clock,
      log: shared.ingestDeps.log,
    },
    actions: shared.actions,
    bridges: {
      takeOver: (_device, client): Promise<WatchBridge> =>
        Promise.resolve({ clientId: client.id, clientName: client.name, since: START }),
    },
    local: shared.local,
    stats: shared.stats,
    clock: shared.ingestDeps.clock,
    now: clock.now,
    log: shared.ingestDeps.log,
  };
}

export async function bottleRig(
  options: { bound?: 'owner' | 'member' | null } = {},
): Promise<BottleRig> {
  const seeded = await seed(options.bound === undefined ? 'owner' : options.bound);
  const { test, clock, owner, device } = seeded;
  const capture = new Capture();
  const bridge: BottleRig['bridge'] = { holder: null };
  const parts = partsOf(seeded, capture, bridge);
  const cap = new FakeCap(Date.parse(START));
  const ingest = new BottleIngest(parts.ingestDeps);
  const sync: BottleRig['sync'] = (minutes = 0, by = owner, trigger = 'wake') => {
    clock.advanceTo(new Date(Date.parse(START) + minutes * 60_000).toISOString());
    const entry = test.store.localDevices.byExternalId(device.external_id);
    const plan = syncPlanOf(planDepsOf(parts.ingestDeps), { entry, deviceId: device.id });
    return ingest.process(
      test.store.devices.byId(device.id),
      entry,
      by.client,
      runPlan(plan, cap, { now: clock.now(), trigger }),
    );
  };
  return {
    ...seeded,
    cap,
    states: capture.states,
    events: capture.events,
    observed: capture.observed,
    pushes: capture.pushes,
    bridge,
    ingest,
    ...parts,
    sync,
    act: (by, action) =>
      actBottle(parts.acts, test.store.devices.byId(device.id), actorOf(by), action),
    row: () => test.store.devices.byId(device.id),
    entry: () => test.store.localDevices.byExternalId(device.external_id),
    seconds: (minutes) => Math.floor(Date.parse(START) / 1000) + minutes * 60,
    close: () => test.close(),
  };
}

function actorOf(by: Person): Actor {
  return {
    clientId: by.client.id,
    role: by.client.role,
    profileId: by.profile.id,
    client: by.client,
  };
}
