import {
  SONICARE_IDENTITY,
  CLASSIC_SERVICE,
  CONDOR_SERVICE,
  JSON_VALUE,
  TEMPLATE_SCOPES,
  sonicareModelKey,
  brushSettingsOf,
  createClientToken,
  hashClientToken,
  sonicareProfileOf,
  type AdapterSink,
  type BrushActionResult,
  type BrushFrame,
  type BrushGattDump,
  type SonicareIdentity,
  type BrushLinkPhase,
  type BrushLiveNotice,
  type ClientRow,
  type DeviceEvent,
  type DeviceRow,
  type JsonValue,
  type ProfileRow,
  type StateUpdate,
} from '@smarteverything/domain';
import { fullOf } from '@smarteverything/ble';
import type { BrushBrand, RuntimePort } from '../../src/local/toothbrush/brand';
import { brushCapabilities } from '../../src/local/sonicare/capabilities';
import { homeClock } from '../../src/local/toothbrush/clock';
import { DeviceState, Fleet, type FleetOptions } from '../../src/local/toothbrush/fleet';
import { BrushIngest } from '../../src/local/toothbrush/ingest';
import { Publisher } from '../../src/local/toothbrush/publisher';
import { BrushRuntime } from '../../src/local/toothbrush/runtime';
import { FakeClock } from './fake-clock';
import { testLogger } from './logs';
import { testStore, type TestStore } from './store';

export const NO_PHONE = {
  broker: {
    run: (): Promise<BrushActionResult> => Promise.reject(new Error('no phone is connected')),
  },
  holderOf: (): string | null => null,
};

export const START = '2026-10-18T10:00:00.000Z';

export const ADDRESS = '24:E5:AA:00:00:03';

export interface Person {
  readonly profile: ProfileRow;
  readonly client: ClientRow;
}

export interface Seed {
  readonly test: TestStore;
  readonly clock: FakeClock;
  readonly owner: Person;
  readonly member: Person;
  readonly device: DeviceRow;
}

export function identityOf(values: Partial<SonicareIdentity> = {}): SonicareIdentity {
  return SONICARE_IDENTITY.parse({
    model: 'HX992X',
    serial: '0143C5C968',
    firmware: '2.15.1 0.6.1.0',
    manufacturer: 'Philips OHC',
    pnp: null,
    stack: 'classic',
    bonded: false,
    address: ADDRESS,
    gapName: 'Philips Sonicare',
    services: [],
    ports: [],
    routineIds: [0, 1, 2, 4],
    clockIsUnix: true,
    ...values,
  });
}

function person(
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

function seedDevice(
  test: TestStore,
  identity: SonicareIdentity,
  personId: string,
  settings: Readonly<Record<string, unknown>>,
): DeviceRow {
  const externalId = `philips_sonicare:${identity.serial ?? identity.address}`;
  const model = sonicareModelKey(identity);
  test.store.localDevices.add({
    externalId,
    driver: 'philips_sonicare',
    address: identity.address,
    name: 'Toothbrush',
    config: {
      model,
      room: null,
      identity: JSON_VALUE.parse(identity),
      settings: JSON_VALUE.parse(brushSettingsOf({ personId, ...settings })),
    },
  });
  const [stored] = test.store.devices.upsert([
    {
      provider: 'local',
      externalId,
      parentId: null,
      kind: 'other',
      name: 'Toothbrush',
      model,
      manufacturer: 'philips',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: brushCapabilities(sonicareProfileOf(identity), identity),
      details: {},
    },
  ]);
  if (stored === undefined) {
    throw new Error('the toothbrush was not stored');
  }
  return stored;
}

export async function seed(
  identity: SonicareIdentity,
  settings: Readonly<Record<string, unknown>> = {},
  owns: 'owner' | 'member' = 'owner',
): Promise<Seed> {
  const clock = new FakeClock(START);
  const test = await testStore(clock.now);
  const owner = person(test, 'Owner', 'owner', test.store.profiles.first());
  const member = person(test, 'Kid', 'member', test.store.profiles.create({ name: 'Kid' }));
  test.store.personAccess.change(member.profile.id, {
    role: 'member',
    template: 'adult',
    scopes: TEMPLATE_SCOPES.adult,
  });
  const personId = owns === 'owner' ? owner.profile.id : member.profile.id;
  return { test, clock, owner, member, device: seedDevice(test, identity, personId, settings) };
}

class Capture {
  readonly states: StateUpdate[] = [];
  readonly events: DeviceEvent[] = [];
  readonly observed: Record<string, JsonValue>[] = [];
  readonly pushed: { capability: string; value: number }[] = [];
  readonly notices: { deviceId: string; notices: (BrushLiveNotice | null)[] }[] = [];
  readonly watched = { value: false };

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
}

export interface SonicareRig extends Seed {
  readonly fleet: Fleet;
  readonly ingest: BrushIngest;
  readonly states: StateUpdate[];
  readonly events: DeviceEvent[];
  readonly observed: Record<string, JsonValue>[];
  readonly pushed: { capability: string; value: number }[];
  readonly notices: Capture['notices'];
  readonly watched: { value: boolean };
  readonly at: (seconds: number) => string;
  readonly frame: (key: string, hex: string, seconds: number) => BrushFrame;
  readonly batch: (
    seconds: number,
    frames: readonly BrushFrame[],
    phase?: BrushLinkPhase,
  ) => ReturnType<BrushIngest['process']>;
  readonly row: () => DeviceRow;
  readonly close: () => Promise<void>;
}

function at(seconds: number): string {
  return new Date(Date.parse(START) + seconds * 1000).toISOString();
}

class BrandFleet extends Fleet {
  private readonly own = new Map<string, DeviceState>();

  constructor(
    private readonly settings: FleetOptions,
    private readonly definition: BrushBrand,
  ) {
    super(settings);
  }

  override of(device: DeviceRow): DeviceState {
    const known = this.own.get(device.id);
    if (known !== undefined) {
      return known;
    }
    const entry = this.settings.store.localDevices.byExternalId(device.external_id);
    const port: RuntimePort = {
      entry: () => entry,
      persist: () => undefined,
      known: () => false,
    };
    const runtime = new BrushRuntime(this.definition, entry, port);
    const state = new DeviceState(device.id, entry, runtime, {
      phase: 'asleep',
      rssi: null,
      detail: null,
      heardAt: null,
    });
    this.own.set(device.id, state);
    return state;
  }

  override known(deviceId: string): DeviceState | undefined {
    return this.own.get(deviceId);
  }
}

function ingestOf(
  seeded: Seed,
  capture: Capture,
  definition: BrushBrand | undefined,
): { fleet: Fleet; ingest: BrushIngest } {
  const { test, clock } = seeded;
  const log = testLogger('sonicare');
  const options = { store: test.store, log };
  const fleet = definition === undefined ? new Fleet(options) : new BrandFleet(options, definition);
  const ingest = new BrushIngest({
    store: test.store,
    fleet,
    publisher: new Publisher({
      sink: (): AdapterSink => capture.sink,
      metrics: {
        push: (_deviceId, capability, value): void => {
          capture.pushed.push({ capability, value });
        },
      },
    }),
    sink: (): AdapterSink => capture.sink,
    local: {
      observe: (_id, values): Promise<void> => {
        capture.observed.push({ ...values });
        return Promise.resolve();
      },
    },
    clock: homeClock(test.store),
    live: {
      watched: (): boolean => capture.watched.value,
      publish: (deviceId, noticeFor): void => {
        capture.notices.push({
          deviceId,
          notices: [seeded.owner.client, seeded.member.client].map((client) => noticeFor(client)),
        });
      },
    },
    now: clock.now,
    at: clock.at,
    log,
  });
  return { fleet, ingest };
}

export async function sonicareRig(
  identity: SonicareIdentity = identityOf(),
  settings: Readonly<Record<string, unknown>> = {},
  owns: 'owner' | 'member' = 'owner',
  definition?: BrushBrand,
): Promise<SonicareRig> {
  const seeded = await seed(identity, settings, owns);
  const capture = new Capture();
  const { test, clock } = seeded;
  const { fleet, ingest } = ingestOf(seeded, capture, definition);
  return {
    ...seeded,
    fleet,
    ingest,
    states: capture.states,
    events: capture.events,
    observed: capture.observed,
    pushed: capture.pushed,
    notices: capture.notices,
    watched: capture.watched,
    at,
    frame: (key, hex, seconds): BrushFrame => ({
      at: at(seconds),
      characteristic: fullOf(key),
      hex,
    }),
    batch: (seconds, frames, phase = 'linked'): ReturnType<BrushIngest['process']> => {
      clock.advanceTo(at(seconds));
      return ingest.process(test.store.devices.byId(seeded.device.id), seeded.owner.client, {
        frames: [...frames],
        link: { phase, rssi: -55, detail: null },
      });
    },
    row: (): DeviceRow => test.store.devices.byId(seeded.device.id),
    close: test.close,
  };
}

export function dumpOf(identity: SonicareIdentity): BrushGattDump {
  const text = (value: string | null): string => Buffer.from(value ?? '').toString('hex');
  return {
    name: identity.gapName ?? 'Philips Sonicare',
    services: [
      {
        uuid: identity.stack === 'condor' ? CONDOR_SERVICE : CLASSIC_SERVICE,
        characteristics: [],
      },
      {
        uuid: '180a',
        characteristics: [
          { uuid: '2a24', properties: ['read'], value: text(identity.model) },
          { uuid: '2a25', properties: ['read'], value: text(identity.serial) },
          { uuid: '2a26', properties: ['read'], value: text(identity.firmware) },
          { uuid: '2a29', properties: ['read'], value: text(identity.manufacturer) },
        ],
      },
    ],
  };
}

export function long(value: number): string {
  return `${word(value & 0xffff)}${word((value >>> 16) & 0xffff)}`;
}

export function word(value: number): string {
  return `${(value & 0xff).toString(16).padStart(2, '0')}${((value >> 8) & 0xff).toString(16).padStart(2, '0')}`;
}

export function lastState(
  rig: Pick<SonicareRig, 'states'>,
  capability: string,
): JsonValue | undefined {
  return [...rig.states].reverse().find((update) => update.capability === capability)?.value;
}
