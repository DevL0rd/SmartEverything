import { bytesToHex, identityOf, wilinkChecksum } from '@smarteverything/ble';
import {
  JSON_VALUE,
  TEMPLATE_SCOPES,
  createClientToken,
  hashClientToken,
  settingsOf,
  type AdapterSink,
  type ClientRow,
  type DeviceEvent,
  type DeviceRow,
  type JsonValue,
  type ProfileRow,
  type StateUpdate,
  type TreadmillFrame,
  type TreadmillGattDump,
  type TreadmillLiveNotice,
  type TreadmillFamily,
} from '@smarteverything/domain';
import { treadmillCapabilities } from '../../src/local/treadmill/capabilities';
import { Fleet } from '../../src/local/treadmill/fleet';
import { TreadmillHealth } from '../../src/local/treadmill/health';
import { TreadmillIngest } from '../../src/local/treadmill/ingest';
import { Publisher } from '../../src/local/treadmill/publisher';
import { FakeClock } from './fake-clock';
import { testLogger } from './logs';
import { testStore, type TestStore } from './store';

const START = '2026-10-18T10:00:00.000Z';

export const ADDRESS = 'AA:BB:CC:DD:EE:01';

export const WILINK_GATT: TreadmillGattDump = {
  name: 'KS-KFK15',
  services: [
    {
      uuid: 'fe00',
      characteristics: [
        { uuid: 'fe01', properties: ['notify'] },
        { uuid: 'fe02', properties: ['write_no_response'] },
      ],
    },
    {
      uuid: '180a',
      characteristics: [
        { uuid: '2a29', properties: ['read'], value: Buffer.from('Kingsmith').toString('hex') },
        { uuid: '2a24', properties: ['read'], value: Buffer.from('K15').toString('hex') },
      ],
    },
  ],
};

export const FTMS_GATT: TreadmillGattDump = {
  name: 'KS-HD-Z1D',
  services: [
    {
      uuid: '1826',
      characteristics: [
        { uuid: '2acd', properties: ['notify'] },
        { uuid: '2ada', properties: ['notify'] },
        { uuid: '2ad9', properties: ['write', 'indicate'] },
        { uuid: '2ad4', properties: ['read'], value: '5000dc050a00' },
      ],
    },
  ],
};

export interface Person {
  readonly profile: ProfileRow;
  readonly client: ClientRow;
}

export interface StatusFields {
  readonly state: number;
  readonly speed10?: number;
  readonly mode?: number;
  readonly time?: number;
  readonly distance10m?: number;
  readonly steps?: number;
  readonly button?: number;
}

export function statusHex(fields: StatusFields): string {
  const body = new Array<number>(20).fill(0);
  body[0] = 0xf8;
  body[1] = 0xa2;
  body[2] = fields.state;
  body[3] = fields.speed10 ?? 0;
  body[4] = fields.mode ?? 1;
  const time = fields.time ?? 0;
  const distance = fields.distance10m ?? 0;
  const steps = fields.steps ?? 0;
  [time, distance, steps].forEach((value, index) => {
    body[5 + index * 3] = (value >> 16) & 0xff;
    body[6 + index * 3] = (value >> 8) & 0xff;
    body[7 + index * 3] = value & 0xff;
  });
  body[16] = fields.button ?? 0;
  body[18] = wilinkChecksum(body, 1, 18);
  body[19] = 0xfd;
  return bytesToHex(Uint8Array.from(body));
}

export const IDLE = 0;
export const RUNNING = 1;
export const COUNTDOWN = 9;
export const STOPPED = 3;

export interface TreadmillRig {
  readonly test: TestStore;
  readonly clock: FakeClock;
  readonly owner: Person;
  readonly member: Person;
  readonly device: DeviceRow;
  readonly fleet: Fleet;
  readonly ingest: TreadmillIngest;
  readonly states: StateUpdate[];
  readonly events: DeviceEvent[];
  readonly observed: Record<string, JsonValue>[];
  readonly pushed: { capability: string; value: number }[];
  readonly notices: { deviceId: string; notices: (TreadmillLiveNotice | null)[] }[];
  readonly watched: { value: boolean };
  readonly holder: { clientId: string | null };
  readonly frame: (hex: string, seconds: number) => TreadmillFrame;
  readonly batch: (
    seconds: number,
    hexes: readonly string[],
    client?: Person,
  ) => ReturnType<TreadmillIngest['process']>;
  readonly weigh: (person: Person, kilograms: number) => void;
  readonly row: () => DeviceRow;
  readonly close: () => Promise<void>;
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

interface Seed {
  readonly test: TestStore;
  readonly clock: FakeClock;
  readonly owner: Person;
  readonly member: Person;
  readonly device: DeviceRow;
}

function seedDevice(test: TestStore, family: TreadmillFamily, gatt: TreadmillGattDump): DeviceRow {
  const identity = identityOf(gatt);
  const externalId = `kingsmith_treadmill:${ADDRESS}`;
  test.store.localDevices.add({
    externalId,
    driver: 'kingsmith_treadmill',
    address: ADDRESS,
    name: 'Walking pad',
    config: {
      model: 'kingsmith.treadmill.k15',
      room: null,
      family,
      gatt: JSON_VALUE.parse(gatt),
      settings: settingsOf(undefined),
    },
  });
  const [stored] = test.store.devices.upsert([
    {
      provider: 'local',
      externalId,
      parentId: null,
      kind: 'appliance',
      name: 'Walking pad',
      model: 'kingsmith.treadmill.k15',
      manufacturer: 'kingsmith',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: treadmillCapabilities(family, identity),
      details: {},
    },
  ]);
  if (stored === undefined) {
    throw new Error('the treadmill was not stored');
  }
  return stored;
}

async function seed(family: TreadmillFamily, gatt: TreadmillGattDump): Promise<Seed> {
  const clock = new FakeClock(START);
  const test = await testStore(clock.now);
  const owner = person(test, 'Owner', 'owner', test.store.profiles.first());
  const member = person(test, 'Kid', 'member', test.store.profiles.create({ name: 'Kid' }));
  test.store.personAccess.change(member.profile.id, {
    role: 'member',
    template: 'adult',
    scopes: TEMPLATE_SCOPES.adult,
  });
  return { test, clock, owner, member, device: seedDevice(test, family, gatt) };
}

class Capture {
  readonly states: StateUpdate[] = [];
  readonly events: DeviceEvent[] = [];
  readonly observed: Record<string, JsonValue>[] = [];
  readonly pushed: { capability: string; value: number }[] = [];
  readonly notices: TreadmillRig['notices'] = [];
  readonly watched = { value: false };
  readonly holder: { clientId: string | null };

  constructor(holder: string) {
    this.holder = { clientId: holder };
  }

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

function ingestOf(seeded: Seed, capture: Capture): { fleet: Fleet; ingest: TreadmillIngest } {
  const { test } = seeded;
  const log = testLogger('treadmill');
  const fleet = new Fleet({ store: test.store, log });
  const ingest = new TreadmillIngest({
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
    health: new TreadmillHealth(test.store),
    live: {
      watched: (): boolean => capture.watched.value,
      publish: (deviceId, noticeFor): void => {
        capture.notices.push({
          deviceId,
          notices: [seeded.owner.client, seeded.member.client].map((client) => noticeFor(client)),
        });
      },
    },
    holderOf: (): string | null => capture.holder.clientId,
    now: seeded.clock.now,
    log,
  });
  return { fleet, ingest };
}

function bodyOf(seeded: Seed, ingest: TreadmillIngest): TreadmillRig['batch'] {
  const { test, clock, device } = seeded;
  return (seconds, hexes, by = seeded.owner): ReturnType<TreadmillIngest['process']> => {
    clock.advanceTo(new Date(Date.parse(START) + seconds * 1000).toISOString());
    return ingest.process(test.store.devices.byId(device.id), by.client, {
      frames: hexes.map((hex) => frameAt(hex, seconds)),
      link: { phase: 'linked', rssi: -55, reconnects: 0, detail: null },
    });
  };
}

function frameAt(hex: string, seconds: number): TreadmillFrame {
  return {
    at: new Date(Date.parse(START) + seconds * 1000).toISOString(),
    characteristic: 'fe01',
    hex,
  };
}

function weighing(seeded: Seed): TreadmillRig['weigh'] {
  const { test, device } = seeded;
  return (who, kilograms): void => {
    const merged = test.store.bodyReadings.merge({
      deviceId: device.id,
      measuredAt: new Date(Date.parse(START) + (who.profile.position + 1) * 60_000).toISOString(),
      scaleUser: who.profile.scale_user ?? 1,
      weightKg: kilograms,
      heartRate: null,
      impedance: null,
    });
    test.store.bodyReadings.own(merged.after.id, {
      profileId: who.profile.id,
      attribution: 'person',
      bmi: null,
      composition: null,
    });
  };
}

export async function treadmillRig(
  family: TreadmillFamily = 'wilink',
  gatt: TreadmillGattDump = WILINK_GATT,
): Promise<TreadmillRig> {
  const seeded = await seed(family, gatt);
  const capture = new Capture(seeded.owner.client.id);
  const { fleet, ingest } = ingestOf(seeded, capture);
  const { test, device } = seeded;
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
    holder: capture.holder,
    frame: frameAt,
    batch: bodyOf(seeded, ingest),
    weigh: weighing(seeded),
    row: (): DeviceRow => test.store.devices.byId(device.id),
    close: (): Promise<void> => test.close(),
  };
}
