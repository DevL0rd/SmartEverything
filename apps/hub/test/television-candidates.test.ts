import { API_ENDPOINTS } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findCandidates } from '../src/adapters/samsung-tv/candidates';
import type { SamsungTvIo } from '../src/adapters/samsung-tv/io';
import type { Caller } from '../src/server/auth';
import { televisionRoutes } from '../src/server/handlers/television';
import { captureLogs, testLogger } from './support/logs';
import { testStore, type TestStore } from './support/store';

const INFO: Readonly<Record<string, unknown>> = {
  '10.0.0.5': {
    type: 'Samsung SmartTV',
    device: { name: '[TV] Living room', modelName: 'QE65S95BAUXXN', wifiMac: 'AA:BB:CC:DD:EE:01' },
  },
  '10.0.0.6': {
    type: 'Samsung SmartTV',
    device: { name: '[TV] Hall', modelName: 'QE43LS03AAUXXN', wifiMac: 'AA:BB:CC:DD:EE:02' },
  },
};

function io(): SamsungTvIo {
  return {
    fetch: (input): Promise<Response> => {
      const host = new URL(input instanceof Request ? input.url : input.toString()).hostname;
      const info = INFO[host];
      return info === undefined
        ? Promise.reject(new TypeError('fetch failed'))
        : Promise.resolve(Response.json(info));
    },
    sendMagicPacket: (): Promise<void> => Promise.resolve(),
    announcements: () => () => undefined,
    openSocket: (): never => {
      throw new Error('discovery opens no socket');
    },
    clock: {
      now: (): Date => new Date(),
      at: (): (() => void) => () => undefined,
      sleep: (): Promise<void> => Promise.resolve(),
    },
  };
}

describe('finding televisions to link directly', () => {
  it('lists the answering ones, the likely match first, and skips the silent', async () => {
    const logs = captureLogs();
    const found = await findCandidates(
      io(),
      () => Promise.resolve(['10.0.0.6', '10.0.0.9', '10.0.0.5']),
      'QA65S95BAKXXT',
      testLogger('television'),
    );
    expect(found).toEqual([
      {
        host: '10.0.0.5',
        name: '[TV] Living room',
        model: 'QE65S95BAUXXN',
        macAddress: 'aa:bb:cc:dd:ee:01',
        likely: true,
      },
      {
        host: '10.0.0.6',
        name: '[TV] Hall',
        model: 'QE43LS03AAUXXN',
        macAddress: 'aa:bb:cc:dd:ee:02',
        likely: false,
      },
    ]);
    expect(logs.events()).toContain('television.candidate_unreadable');
  });

  it('finds nothing when no television answers', async () => {
    expect(
      await findCandidates(io(), () => Promise.resolve([]), 'x', testLogger('television')),
    ).toEqual([]);
  });
});

describe('the endpoint that lists them', () => {
  let test: TestStore;
  let owner: Caller;

  beforeEach(async () => {
    test = await testStore();
    const row = test.store.clients.create({
      name: 'Owner',
      platform: 'android',
      role: 'owner',
      tokenHash: 'a'.repeat(64),
    });
    owner = { kind: 'client', client: row };
  });

  afterEach(async () => {
    await test.close();
  });

  function deviceOf(provider: 'smartthings' | 'xiaomi', kind: 'television' | 'light'): string {
    const [row] = test.store.devices.upsert([
      {
        provider,
        externalId: `${provider}-${kind}`,
        parentId: null,
        kind,
        name: 'Device',
        model: 'QA65S95BAKXXT',
        manufacturer: 'Samsung',
        providerRoom: null,
        roomId: null,
        online: true,
        capabilities: [],
        details: {},
      },
    ]);
    return row?.id ?? '';
  }

  function list(deviceId: string): Promise<unknown> {
    const routes = televisionRoutes(
      { store: test.store, log: testLogger('television') },
      io(),
      () => Promise.resolve(['10.0.0.5']),
    );
    return routes.listTelevisionCandidates.run(
      owner,
      { params: { deviceId }, query: {}, body: undefined, remote: '127.0.0.1' },
      testLogger('television'),
    );
  }

  it('serves the candidates for a SmartThings television', async () => {
    const reply = API_ENDPOINTS.listTelevisionCandidates.response.parse(
      await list(deviceOf('smartthings', 'television')),
    );
    expect(reply).toHaveLength(1);
    expect(reply[0]).toMatchObject({ host: '10.0.0.5', likely: true, linkedTo: null });
  });

  it('says which device a found screen is already linked to', async () => {
    const tv = deviceOf('smartthings', 'television');
    test.store.televisionSettings.setDirectLinks([
      { deviceId: tv, host: '10.0.0.5', macAddress: 'aa:bb:cc:dd:ee:01' },
    ]);
    const reply = API_ENDPOINTS.listTelevisionCandidates.response.parse(await list(tv));
    expect(reply[0]).toMatchObject({ host: '10.0.0.5', linkedTo: tv });
  });

  it('refuses a device that is not a SmartThings television', async () => {
    await expect(list(deviceOf('xiaomi', 'light'))).rejects.toMatchObject({
      code: 'invalid_request',
    });
  });
});
