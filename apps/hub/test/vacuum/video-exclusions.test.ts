import { MCP_HUMAN_ONLY_OPERATIONS } from '@smarteverything/domain';
import { isCameraModel, pv11glCatalog, type DeviceModel } from '@smarteverything/xiaomi';
import { describe, expect, it } from 'vitest';
import { discoveredDevice, type InventoryEntry } from '../../src/adapters/xiaomi/inventory';
import { CameraService, UnknownStreamError } from '../../src/cameras/camera-service';
import { go2rtcClient } from '../../src/cameras/go2rtc-client';
import type { DeviceRecord } from '../../src/database/port';
import { camerasOf } from '../../src/firewall/device-sources';
import { requiredOpenings } from '../../src/firewall/openings';
import { Inventory, cameraSourceOf, vacuumVideoSourceOf } from '../../src/state/inventory';
import { testDatabase } from '../support/database';
import { testLogger } from '../support/logs';
import { fakeGo2rtc } from '../xiaomi/fake-go2rtc';

const MODEL = pv11glCatalog().model;
const IP = '10.0.0.9';
const MAC = 'aa:bb:cc:dd:ee:ff';

const EMPTY_MODEL: DeviceModel = {
  kind: 'vacuum',
  capabilities: [],
  bindings: new Map(),
  propertyKeys: new Map(),
  problems: [],
};

function entry(ip: string | null): InventoryEntry {
  return {
    cloud: {
      did: '5550004',
      name: 'Robot',
      model: MODEL,
      token: null,
      ip,
      mac: null,
      parentDid: null,
      online: true,
      specType: null,
    },
    room: null,
    spec: null,
    model: EMPTY_MODEL,
    specProblem: null,
    ptz: null,
  };
}

function discovered(ip: string | null): ReturnType<typeof discoveredDevice> {
  return discoveredDevice(
    entry(ip),
    {
      transport: 'lan',
      online: true,
      reason: 'test',
      updates: 'push',
      pushSource: null,
      pushSince: null,
    },
    { userId: '1', region: 'de' },
    new Set<string>(),
  );
}

function record(details: DeviceRecord['details']): DeviceRecord {
  return {
    id: '2a000000-0000-4000-8000-000000000009',
    provider: 'xiaomi',
    externalId: '5550004',
    parentId: null,
    kind: 'vacuum',
    online: true,
    roomId: null,
    capabilities: [],
    details,
  };
}

describe('the vacuum camera stays out of the cameras area', () => {
  const details = discovered(IP).details;
  const robot = record(details);

  it('offers live view through its own source, never through a camera go2rtc source', () => {
    const device = discovered(IP);
    expect(device.capabilities.map(({ key }) => key)).toContain('camera_stream');
    expect(vacuumVideoSourceOf(robot)).toBe(
      `xiaomi://1:de@${IP}?did=5550004&model=${MODEL}&transport=udp`,
    );
    expect(cameraSourceOf(robot)).toBeNull();
    expect(isCameraModel(MODEL)).toBe(false);
  });

  it('has no live view without a LAN address', () => {
    const device = discovered(null);
    expect(device.capabilities.map(({ key }) => key)).not.toContain('camera_stream');
    expect(vacuumVideoSourceOf(record(device.details))).toBeNull();
  });

  it('gets no camera row, so no recordings, keep days, transcripts or camera events', async () => {
    const db = await testDatabase();
    try {
      const inventory = new Inventory(db.database, {
        onlineChanged: (): undefined => undefined,
        devicesChanged: (): undefined => undefined,
        lifecycle: (): undefined => undefined,
      });
      await inventory.apply('xiaomi', [discovered(IP)]);
      expect(db.store.cameras.list()).toStrictEqual([]);
    } finally {
      await db.close();
    }
  });

  it('is never a go2rtc stream of the camera service, so no thumbnails, snapshots, clips or AI vision', async () => {
    const go2rtc = fakeGo2rtc();
    const recordings: string[] = [];
    const cameras = new CameraService({
      client: go2rtcClient({
        baseUrl: 'http://127.0.0.1:1984',
        username: 'hub',
        password: 'secret',
        fetch: go2rtc.fetch,
      }),
      conditions: {
        online: (): boolean => true,
        privacyOn: (): boolean => false,
        twoWayAudio: (): boolean => false,
      },
      refusal: (): null => null,
      store: {
        loadCameras: (): Promise<never[]> => Promise.resolve([]),
        storeRecording: (file): Promise<void> => {
          recordings.push(file.path);
          return Promise.resolve();
        },
      },
      now: (): Date => new Date('2026-10-24T10:00:00.000Z'),
      log: testLogger('cameras'),
    });
    await cameras.sync([robot]);
    expect(cameras.hasStream(robot.id)).toBe(false);
    await expect(cameras.snapshot(robot.id, 'thumb')).rejects.toThrow(UnknownStreamError);
    await cameras.record({
      id: 'event-1',
      deviceId: robot.id,
      kind: 'motion',
      occurredAt: '2026-10-24T10:00:00.000Z',
      details: {},
    });
    expect(go2rtc.requests).toStrictEqual([]);
    expect(recordings).toStrictEqual([]);
  });

  it('is in the firewall plan with a UDP opening for its MAC like the other Xiaomi cameras', () => {
    const cameras = camerasOf([robot], testLogger('firewall'));
    expect(cameras).toStrictEqual([{ deviceId: robot.id, address: IP }]);
    const openings = requiredOpenings({
      cameras: cameras.map((camera) => ({ ...camera, mac: MAC })),
      pushing: [],
      plugins: [],
      networks: [],
      webrtcPort: 8555,
    });
    expect(openings[0]).toStrictEqual({
      id: `camera:mac:${MAC}`,
      deviceIds: [robot.id],
      pluginIds: [],
      rule: { purpose: 'camera', protocol: 'udp', mac: MAC, address: IP },
    });
  });

  it('keeps opening the live view and its password away from assistants', () => {
    expect(MCP_HUMAN_ONLY_OPERATIONS.openVacuumVideo).toContain('password');
  });
});
