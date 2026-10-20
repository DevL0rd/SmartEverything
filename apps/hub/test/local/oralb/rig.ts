import {
  JSON_VALUE,
  ORALB_DRIVER,
  ORALB_IDENTITY,
  TEMPLATE_SCOPES,
  brushSettingsOf,
  createClientToken,
  hashClientToken,
  oralbExternalId,
  oralbModelKey,
  type AdapterSink,
  type BrushActionResult,
  type BrushAdvert,
  type BrushFrame,
  type BrushLinkPhase,
  type BrushLiveNotice,
  type BrushStep,
  type ClientRow,
  type DeviceEvent,
  type DeviceRow,
  type JsonValue,
  type OralbIdentity,
  type ProfileRow,
  type StateUpdate,
} from '@smarteverything/domain';
import { oralbFullOf } from '@smarteverything/ble';
import { homeClock } from '../../../src/local/toothbrush/clock';
import { Fleet } from '../../../src/local/toothbrush/fleet';
import { BrushIngest } from '../../../src/local/toothbrush/ingest';
import { Publisher } from '../../../src/local/toothbrush/publisher';
import type { ActDeps } from '../../../src/local/toothbrush/acts';
import { oralbCapabilities } from '../../../src/local/oralb/capabilities';
import { entryConfigOf } from '../../../src/local/oralb/config';
import { FakeClock } from '../../support/fake-clock';
import { testLogger } from '../../support/logs';
import { testStore, type TestStore } from '../../support/store';

export const START = '2026-10-18T10:00:00.000Z';

export const ADDRESS = '78:DB:2F:C2:48:BE';

export interface Person {
  readonly profile: ProfileRow;
  readonly client: ClientRow;
}

export function identityOf(values: Partial<OralbIdentity> = {}): OralbIdentity {
  return ORALB_IDENTITY.parse({
    address: ADDRESS,
    advertAddress: ADDRESS,
    protocol: 8,
    modelId: 0x36,
    firmware: 82,
    gapName: 'Oral-B Toothbrush',
    services: [],
    present: ['FF05', 'FF0A', 'FF0B', 'FF2B', 'FF2D', 'FF25', 'FF26', 'FF29'],
    ff05Length: 8,
    ff05Runtime: 3600,
    ff0bLength: 10,
    ff2bLength: 4,
    ff2dLength: 5,
    advertHex: '0836520832000004001000',
    clock: null,
    ...values,
  });
}

export interface AdvertSpec {
  readonly state: number;
  readonly timerS?: number;
  readonly mode?: number;
  readonly sector?: number;
  readonly face?: number;
  readonly secondsInSector?: number;
  readonly sectorCount?: number;
  readonly high?: boolean;
  readonly protocol?: number;
  readonly firmware?: number;
}

export function advertHex(spec: AdvertSpec): string {
  const timer = spec.timerS ?? 0;
  const bytes = [
    spec.protocol ?? 8,
    0x36,
    spec.firmware ?? 82,
    spec.state,
    0x72 | (spec.high === true ? 0x80 : 0),
    Math.floor(timer / 60),
    timer % 60,
    spec.mode ?? 0,
    (spec.sector ?? 0) | ((spec.face ?? 0) << 3),
    spec.secondsInSector ?? 0,
    spec.sectorCount ?? 4,
  ];
  return Buffer.from(bytes).toString('hex');
}

export function bytes(...values: number[]): string {
  return Buffer.from(values).toString('hex');
}

export function word(value: number): string {
  return bytes(value & 0xff, (value >> 8) & 0xff);
}

export function long(value: number): string {
  return `${word(value & 0xffff)}${word((value >>> 16) & 0xffff)}`;
}

class Capture {
  readonly states: StateUpdate[] = [];
  readonly events: DeviceEvent[] = [];
  readonly observed: Record<string, JsonValue>[] = [];
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

export interface RigOptions {
  readonly identity?: OralbIdentity;
  readonly settings?: Readonly<Record<string, unknown>>;
  readonly oralb?: Readonly<Record<string, unknown>>;
  readonly schedule?: readonly number[] | null;
  readonly owns?: 'owner' | 'member';
}

export interface Batch {
  readonly frames?: readonly BrushFrame[];
  readonly adverts?: readonly BrushAdvert[];
  readonly phase?: BrushLinkPhase;
}

export interface Sent {
  readonly steps: readonly BrushStep[];
}

export interface OralbRig {
  readonly test: TestStore;
  readonly clock: FakeClock;
  readonly owner: Person;
  readonly member: Person;
  readonly device: DeviceRow;
  readonly fleet: Fleet;
  readonly ingest: BrushIngest;
  readonly states: StateUpdate[];
  readonly events: DeviceEvent[];
  readonly observed: Record<string, JsonValue>[];
  readonly notices: Capture['notices'];
  readonly watched: { value: boolean };
  readonly sent: BrushStep[][];
  readonly answers: BrushActionResult[];
  readonly at: (seconds: number) => string;
  readonly advert: (seconds: number, spec: AdvertSpec) => BrushAdvert;
  readonly frame: (key: string, hex: string, seconds: number) => BrushFrame;
  readonly batch: (seconds: number, batch: Batch) => ReturnType<BrushIngest['process']>;
  readonly row: () => DeviceRow;
  readonly entry: () => ReturnType<typeof entryConfigOf>;
  readonly acts: () => ActDeps;
  readonly close: () => Promise<void>;
}

export function at(seconds: number): string {
  return new Date(Date.parse(START) + seconds * 1000).toISOString();
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

function seedDevice(test: TestStore, options: RigOptions, personId: string): DeviceRow {
  const identity = options.identity ?? identityOf();
  const externalId = oralbExternalId(identity);
  const model = oralbModelKey(identity);
  test.store.localDevices.add({
    externalId,
    driver: ORALB_DRIVER,
    address: identity.address,
    name: 'Toothbrush',
    config: {
      model,
      room: null,
      identity: JSON_VALUE.parse(identity),
      settings: JSON_VALUE.parse(
        brushSettingsOf({ personId, ...options.settings, oralb: options.oralb ?? {} }, 'oralb'),
      ),
      schedule: options.schedule === undefined ? null : JSON_VALUE.parse(options.schedule),
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
      manufacturer: 'oralb',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: oralbCapabilities(test.store.localDevices.byExternalId(externalId)),
      details: {},
    },
  ]);
  if (stored === undefined) {
    throw new Error('the toothbrush was not stored');
  }
  return stored;
}

function ingestFor(
  context: { readonly test: TestStore; readonly clock: FakeClock; readonly capture: Capture },
  people: { readonly owner: Person; readonly member: Person },
): { fleet: Fleet; ingest: BrushIngest } {
  const { test, clock, capture } = context;
  const log = testLogger('oralb');
  const fleet = new Fleet({ store: test.store, log });
  const ingest = new BrushIngest({
    store: test.store,
    fleet,
    publisher: new Publisher({
      sink: (): AdapterSink => capture.sink,
      metrics: { push: (): void => undefined },
    }),
    sink: (): AdapterSink => capture.sink,
    local: observer(capture),
    clock: homeClock(test.store),
    live: {
      watched: (): boolean => capture.watched.value,
      publish: (deviceId, noticeFor): void => {
        capture.notices.push({
          deviceId,
          notices: [people.owner.client, people.member.client].map((client) => noticeFor(client)),
        });
      },
    },
    now: clock.now,
    at: clock.at,
    log,
  });
  return { fleet, ingest };
}

function observer(capture: Capture): {
  observe: (id: string, values: Record<string, JsonValue>) => Promise<void>;
} {
  return {
    observe: (_id, values): Promise<void> => {
      capture.observed.push({ ...values });
      return Promise.resolve();
    },
  };
}

function actsFor(
  rig: { readonly test: TestStore; readonly clock: FakeClock; readonly fleet: Fleet },
  scripted: {
    readonly capture: Capture;
    readonly sent: BrushStep[][];
    readonly answers: BrushActionResult[];
    readonly holder: string;
  },
): ActDeps {
  return {
    store: rig.test.store,
    fleet: rig.fleet,
    local: observer(scripted.capture),
    bridges: { takeOver: () => Promise.reject(new Error('unused')) },
    broker: {
      run: (_target, steps): Promise<BrushActionResult> => {
        scripted.sent.push([...steps]);
        return Promise.resolve(scripted.answers.shift() ?? { ok: true, detail: 'ok' });
      },
    },
    holderOf: () => scripted.holder,
    now: rig.clock.now,
    log: testLogger('oralb'),
  };
}

async function seeded(options: RigOptions): Promise<{
  clock: FakeClock;
  test: TestStore;
  owner: Person;
  member: Person;
  device: DeviceRow;
}> {
  const clock = new FakeClock(START);
  const test = await testStore(clock.now);
  const owner = person(test, 'Owner', 'owner', test.store.profiles.first());
  const member = person(test, 'Kid', 'member', test.store.profiles.create({ name: 'Kid' }));
  test.store.personAccess.change(member.profile.id, {
    role: 'member',
    template: 'adult',
    scopes: TEMPLATE_SCOPES.adult,
  });
  const personId = (options.owns === 'member' ? member : owner).profile.id;
  return { clock, test, owner, member, device: seedDevice(test, options, personId) };
}

export async function oralbRig(options: RigOptions = {}): Promise<OralbRig> {
  const base = await seeded(options);
  const { clock, test, owner, device } = base;
  const capture = new Capture();
  const { fleet, ingest } = ingestFor({ test, clock, capture }, base);
  const sent: BrushStep[][] = [];
  const answers: BrushActionResult[] = [];
  return {
    ...base,
    fleet,
    ingest,
    states: capture.states,
    events: capture.events,
    observed: capture.observed,
    notices: capture.notices,
    watched: capture.watched,
    sent,
    answers,
    at,
    advert: (seconds, spec): BrushAdvert => ({ at: at(seconds), rssi: -60, hex: advertHex(spec) }),
    frame: (key, hex, seconds): BrushFrame => ({
      at: at(seconds),
      characteristic: oralbFullOf(key),
      hex,
    }),
    batch: (seconds, batch): ReturnType<BrushIngest['process']> => {
      clock.advanceTo(at(seconds));
      return ingest.process(test.store.devices.byId(device.id), owner.client, {
        frames: [...(batch.frames ?? [])],
        adverts: [...(batch.adverts ?? [])],
        link: { phase: batch.phase ?? 'asleep', rssi: -60, detail: null },
      });
    },
    row: (): DeviceRow => test.store.devices.byId(device.id),
    entry: () => entryConfigOf(test.store.localDevices.byExternalId(device.external_id)),
    acts: (): ActDeps =>
      actsFor({ test, clock, fleet }, { capture, sent, answers, holder: owner.client.id }),
    close: test.close,
  };
}

export interface RecordSpec {
  readonly startClock: number;
  readonly sessionId: number;
  readonly user?: number;
  readonly target?: number;
  readonly sectors?: number;
  readonly duration: number;
  readonly highDs?: number;
  readonly lowDs?: number;
  readonly avg?: number;
  readonly max?: number;
  readonly highEvents?: number;
  readonly lowEvents?: number;
  readonly mode?: number;
  readonly battery?: number;
}

const RECORD_DEFAULTS = {
  user: 0,
  target: 120,
  sectors: 4,
  highDs: 0,
  lowDs: 0,
  avg: 0,
  max: 0,
  highEvents: 0,
  lowEvents: 0,
  mode: 0,
  battery: 90,
} as const;

export function recordHex(spec: RecordSpec): string {
  const full = { ...RECORD_DEFAULTS, ...spec };
  return [
    long(full.startClock),
    word(full.sessionId | (full.user << 13)),
    word(full.target | (full.sectors << 13)),
    word(full.duration),
    word(full.highDs),
    word(full.lowDs),
    bytes(full.avg, full.max, full.highEvents, full.lowEvents, 1, full.mode, full.battery),
  ].join('');
}

export function headerHex(spec: Omit<RecordSpec, 'duration'>): string {
  const full = { ...RECORD_DEFAULTS, ...spec };
  return [
    long(full.startClock),
    word(full.sessionId | (full.user << 13)),
    word(full.target | (full.sectors << 13)),
    '0102030405060708090a0b0c0d',
  ].join('');
}

export function pressureHex(pressure: number, force: number, angle = 2800): string {
  return `${bytes(pressure)}${word(0)}${word(force)}${word(angle)}${word(1000)}${bytes(1)}`;
}

export function lastState(
  rig: Pick<OralbRig, 'states'>,
  capability: string,
): JsonValue | undefined {
  return [...rig.states].reverse().find((update) => update.capability === capability)?.value;
}
