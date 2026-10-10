import { describe, expect, it } from 'vitest';
import type { DeviceRecord } from '../src/database/port';
import { Inventory, cameraSourceOf, type OnlineChange } from '../src/state/inventory';
import { FakeDatabase } from './support/fake-database';
import { CAMERA, GATEWAY, LAMP } from './support/fake-provider';

function subject(db = new FakeDatabase()): {
  db: FakeDatabase;
  inventory: Inventory;
  online: OnlineChange[];
  changed: (readonly DeviceRecord[])[];
} {
  const online: OnlineChange[] = [];
  const changed: (readonly DeviceRecord[])[] = [];
  const inventory = new Inventory(db, {
    onlineChanged: (change): void => {
      online.push(change);
    },
    devicesChanged: (devices): void => {
      changed.push(devices);
    },
  });
  return { db, inventory, online, changed };
}

describe('Inventory', () => {
  it('stores discovered devices, links children to parents and places new devices in provider rooms', async () => {
    const { db, inventory, changed } = subject();
    const records = await inventory.apply('xiaomi', [CAMERA, GATEWAY, LAMP]);
    const gateway = inventory.deviceOf('xiaomi', 'gateway-1');
    const camera = inventory.deviceOf('xiaomi', 'camera-1');
    expect(records.map((device) => device.externalId)).toStrictEqual([
      'camera-1',
      'gateway-1',
      'lamp-1',
    ]);
    expect(camera?.parentId).toBe(gateway?.id);
    expect(inventory.deviceOf('xiaomi', 'lamp-1')?.roomId).toBe(db.rooms.get('Study'));
    expect([...db.rooms.keys()].sort()).toStrictEqual(['Hall', 'Study']);
    expect(changed).toHaveLength(1);
    expect(inventory.devicesOf('xiaomi')).toHaveLength(3);
    expect(inventory.devicesOf('tuya')).toHaveLength(0);
    expect(inventory.all()).toHaveLength(3);
  });

  it('registers cameras with their stream name, source scheme, PTZ and talk support', async () => {
    const { db, inventory } = subject();
    await inventory.apply('xiaomi', [CAMERA]);
    const camera = inventory.deviceOf('xiaomi', 'camera-1');
    expect([...db.cameras.values()]).toStrictEqual([
      {
        deviceId: camera?.id,
        streamName: camera?.id,
        sourceUrlKind: 'rtsp',
        physicalPtz: true,
        twoWayAudio: false,
        recordEvents: true,
      },
    ]);
    expect(camera === undefined ? null : cameraSourceOf(camera)).toBe('rtsp://camera.local/stream');
  });

  it('refuses a camera source without a scheme', async () => {
    const { inventory } = subject();
    await expect(
      inventory.apply('xiaomi', [{ ...CAMERA, details: { go2rtcSource: '/dev/video0' } }]),
    ).rejects.toThrow(
      'Camera camera-1 has no usable go2rtc source; expected a URL with a scheme, received "/dev/video0".',
    );
  });

  it('refuses a device reported by the wrong provider', async () => {
    const { inventory } = subject();
    await expect(inventory.apply('tuya', [LAMP])).rejects.toThrow(
      'The tuya adapter reported device lamp-1 as a xiaomi device; every device it reports must be a tuya device.',
    );
  });

  it('announces online changes of known devices only', async () => {
    const { inventory, online } = subject();
    await inventory.apply('xiaomi', [LAMP]);
    await inventory.apply('xiaomi', [{ ...LAMP, online: false }]);
    await inventory.apply('xiaomi', [{ ...LAMP, online: false }]);
    await inventory.apply('xiaomi', [{ ...LAMP, online: true }]);
    expect(online.map((change) => change.online)).toStrictEqual([false, true]);
  });

  it('does not create rooms again for devices it already knows', async () => {
    const { db, inventory } = subject();
    await inventory.apply('xiaomi', [LAMP]);
    db.rooms.clear();
    await inventory.apply('xiaomi', [{ ...LAMP, room: 'Kitchen' }]);
    expect(db.rooms.size).toBe(0);
  });

  it('places a known device that is still unplaced once its provider reports a room', async () => {
    const { db, inventory } = subject();
    await inventory.apply('xiaomi', [{ ...LAMP, room: null }]);
    expect(inventory.deviceOf('xiaomi', 'lamp-1')?.roomId).toBeNull();
    await inventory.apply('xiaomi', [{ ...LAMP, room: 'Kitchen' }]);
    expect(inventory.deviceOf('xiaomi', 'lamp-1')?.roomId).toBe(db.rooms.get('Kitchen'));
  });

  it('loads what is already stored and marks a provider offline', async () => {
    const db = new FakeDatabase();
    await subject(db).inventory.apply('xiaomi', [LAMP, GATEWAY]);
    const { inventory, online } = subject(db);
    await inventory.load();
    expect(inventory.deviceOf('xiaomi', 'lamp-1')?.online).toBe(true);
    await inventory.markOffline('xiaomi');
    expect(inventory.devicesOf('xiaomi').every((device) => !device.online)).toBe(true);
    expect(online).toHaveLength(2);
    await inventory.markOffline('xiaomi');
    expect(online).toHaveLength(2);
    expect(inventory.deviceById(inventory.deviceOf('xiaomi', 'lamp-1')?.id ?? '')?.externalId).toBe(
      'lamp-1',
    );
  });
});
