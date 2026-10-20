import {
  API_ENDPOINTS,
  type CapabilityKey,
  type DeviceCommand,
  type EventKind,
  type JsonValue,
} from '@smarteverything/domain';
import { SIGNAL_MIN_INTERVAL_MS } from '../../../src/state/change-threshold';
import { SimulatedClock as TestClock } from '../../../src/clock/simulated';
import { skyControls, skyFetch, type FakeSky, type Sky } from './weather';
import {
  bootServer,
  linkFakeProvider,
  pairPhone,
  tunnel,
  verifiedPublicUrl,
  type Booted,
} from '../../support/booted';
import type { FakeModule } from '../../support/fake-provider';
import { captureLogs } from '../../support/logs';
import { temporaryDirectory } from '../../support/server';
import { clientOf, type Client } from './client';
import { ALL_DEVICES, type DeviceIds } from './devices';

export const START = '2026-10-08T10:00:00.000Z';

export interface Rig extends Client {
  readonly booted: Booted;
  readonly clock: TestClock;
  readonly fake: FakeModule;
  readonly ids: DeviceIds;
  readonly profileId: string;
  readonly sky: Sky;
  readonly member: () => Promise<Client>;
  readonly mcp: () => Promise<string>;
  readonly roomIds: Readonly<Record<string, string>>;
  readonly state: (
    externalId: string,
    capability: CapabilityKey,
    value: JsonValue,
  ) => Promise<void>;
  readonly spacedState: (
    externalId: string,
    capability: CapabilityKey,
    value: JsonValue,
  ) => Promise<void>;
  readonly event: (
    externalId: string,
    kind: EventKind,
    details?: Readonly<Record<string, JsonValue>>,
  ) => Promise<void>;
  readonly commands: () => readonly DeviceCommand[];
  readonly sent: () => readonly (readonly [string, string, JsonValue])[];
  readonly until: (condition: () => boolean | Promise<boolean>) => Promise<void>;
  readonly settle: () => Promise<void>;
  readonly close: () => Promise<void>;
}

class Observations {
  private readonly latest = new Map<string, number>();

  next(externalId: string, capability: string, newest: number): string {
    const key = `${externalId}|${capability}`;
    const moment = Math.max(newest, (this.latest.get(key) ?? 0) + 1);
    this.latest.set(key, moment);
    return new Date(moment).toISOString();
  }
}

async function settle(turns = 8): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

async function until(condition: () => boolean | Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('The awaited condition was never reached.');
}

async function lookups(client: Client): Promise<Pick<Rig, 'ids' | 'roomIds' | 'profileId'>> {
  const devices = await client.request(API_ENDPOINTS.listDevices);
  const idOf = (externalId: string): string => {
    const found = devices.find((device) => device.external_id === externalId);
    if (found === undefined) throw new Error(`The rig has no device ${externalId}.`);
    return found.id;
  };
  const rooms = await client.request(API_ENDPOINTS.listRooms);
  const snapshot = await client.request(API_ENDPOINTS.readSnapshot);
  const owner = snapshot.tables.profiles[0];
  if (owner === undefined) throw new Error('The rig has no profile.');
  return {
    profileId: owner.id,
    ids: {
      lamp: idOf('lamp-1'),
      lampTwo: idOf('lamp-2'),
      fan: idOf('fan-1'),
      sensor: idOf('sensor-1'),
      purifier: idOf('purifier-1'),
    },
    roomIds: Object.fromEntries(rooms.map((room) => [room.name, room.id])),
  };
}

function memberClient(booted: Booted): () => Promise<Client> {
  let member: Promise<Client> | undefined;
  return () => {
    member ??= (async (): Promise<Client> => {
      await verifiedPublicUrl(booted);
      const paired = await pairPhone(booted, 'member');
      return clientOf(booted.base, paired.token);
    })();
    return member;
  };
}

function mcpToken(booted: Booted, client: Client): () => Promise<string> {
  let token: Promise<string> | undefined;
  return () => {
    token ??= (async (): Promise<string> => {
      await verifiedPublicUrl(booted);
      return (await client.request(API_ENDPOINTS.createMcpToken, { body: { name: 'ChatGPT' } }))
        .token;
    })();
    return token;
  };
}

function feeders(fake: FakeModule, clock: TestClock): Pick<Rig, 'state' | 'spacedState' | 'event'> {
  const observation = new Observations();
  const state: Rig['state'] = async (externalId, capability, value): Promise<void> => {
    fake.adapter.sink?.state({
      externalId,
      capability,
      value,
      observedAt: observation.next(externalId, capability, clock.latest()),
    });
    await settle();
  };
  return {
    state,
    spacedState: async (externalId, capability, value): Promise<void> => {
      clock.advanceTo(new Date(clock.now().getTime() + SIGNAL_MIN_INTERVAL_MS).toISOString());
      await state(externalId, capability, value);
    },
    event: async (externalId, kind, details = {}): Promise<void> => {
      fake.adapter.sink?.event({
        externalId,
        kind,
        occurredAt: clock.now().toISOString(),
        details,
      });
      await settle();
    },
  };
}

export async function openRig(start: string = START): Promise<Rig> {
  captureLogs();
  const directory = await temporaryDirectory();
  const clock = new TestClock(start);
  const sky: FakeSky = { temperature: 15, humidity: 50, code: 3 };
  let base = '';
  const booted = await bootServer(directory.path, {
    clock,
    fetch: skyFetch(sky, clock, (url, init) => tunnel(() => base)(url, init)),
  });
  base = booted.base;
  const { fake } = booted;
  fake.adapter.devices = ALL_DEVICES;
  const client = clientOf(booted.base, booted.owner);
  await client.request(API_ENDPOINTS.createRoom, { body: { name: 'Study' } });
  await client.request(API_ENDPOINTS.createRoom, { body: { name: 'Hall' } });
  await linkFakeProvider(booted);
  await client.request(API_ENDPOINTS.updateHome, {
    body: { time_zone: 'UTC', latitude: 52.52, longitude: 13.405 },
  });
  return {
    ...client,
    ...(await lookups(client)),
    ...feeders(fake, clock),
    booted,
    clock,
    fake,
    member: memberClient(booted),
    mcp: mcpToken(booted, client),
    sky: skyControls(sky, clock, client),
    commands: () => fake.adapter.executed,
    sent: () =>
      fake.adapter.executed.map((command) => [
        command.externalId,
        command.capability,
        command.value,
      ]),
    until,
    settle,
    close: async (): Promise<void> => {
      await booted.server.stop();
      await directory.remove();
    },
  };
}
