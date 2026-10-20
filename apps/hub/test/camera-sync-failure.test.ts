import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CameraService } from '../src/cameras/camera-service';
import { go2rtcClient, type Go2rtcClient } from '../src/cameras/go2rtc-client';
import type { DeviceRecord } from '../src/database/port';
import { testDatabase, type TestDatabase } from './support/database';
import { captureLogs, testLogger, type CapturedLogs } from './support/logs';

let logs: CapturedLogs;
let db: TestDatabase;

beforeEach(() => {
  logs = captureLogs();
});

afterEach(async () => {
  await db.close();
});

async function cameras(): Promise<readonly DeviceRecord[]> {
  db = await testDatabase();
  const stored = await db.database.upsertDevices(
    ['one', 'two', 'three'].map((externalId) => ({
      provider: 'xiaomi',
      externalId,
      parentId: null,
      kind: 'camera',
      name: externalId,
      model: 'cam',
      manufacturer: 'cam',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: {},
    })),
  );
  return stored.map((device) => ({
    ...device,
    details: { go2rtcSource: `rtsp://10.0.0.9/${device.externalId}` },
  }));
}

function client(refused: ReadonlySet<string>, preloaded: string[]): Go2rtcClient {
  return go2rtcClient({
    baseUrl: 'http://127.0.0.1:1984',
    username: 'hub',
    password: 'secret',
    fetch: (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input);
      const stream = url.searchParams.get('src') ?? '';
      if (url.pathname === '/api/preload' && init?.method === 'PUT') {
        if (refused.has(stream)) {
          return Promise.resolve(new Response('i/o timeout', { status: 500 }));
        }
        preloaded.push(stream);
      }
      return Promise.resolve(new Response(null));
    },
  });
}

function serviceOf(go2rtc: Go2rtcClient): CameraService {
  return new CameraService({
    client: go2rtc,
    conditions: { online: () => true, privacyOn: () => false, twoWayAudio: () => false },
    refusal: () => null,
    store: db.database,
    now: () => new Date('2026-10-21T00:00:00.000Z'),
    log: testLogger('cameras'),
  });
}

describe('syncing camera streams', () => {
  it('keeps going and resolves when one camera cannot be registered', async () => {
    const devices = await cameras();
    const [first, second, third] = devices;
    if (first === undefined || second === undefined || third === undefined) {
      throw new Error('The cameras were not stored.');
    }
    const preloaded: string[] = [];
    const refused = new Set([second.id]);
    const service = serviceOf(client(refused, preloaded));

    await expect(service.sync(devices)).resolves.toBeUndefined();

    expect(preloaded).toEqual([first.id, third.id]);
    expect(service.hasStream(first.id)).toBe(true);
    expect(service.hasStream(second.id)).toBe(false);
    expect(service.hasStream(third.id)).toBe(true);
    expect(logs.events()).toContain('stream.sync_failed');
  });

  it('registers the failed camera on the next sync once it answers', async () => {
    const devices = await cameras();
    const second = devices[1];
    if (second === undefined) throw new Error('The cameras were not stored.');
    const preloaded: string[] = [];
    const refused = new Set([second.id]);
    const service = serviceOf(client(refused, preloaded));
    await service.sync(devices);
    refused.delete(second.id);
    await service.sync(devices);
    expect(service.hasStream(second.id)).toBe(true);
  });
});
