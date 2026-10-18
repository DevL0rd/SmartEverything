import { afterEach, describe, expect, it } from 'vitest';
import type { DeviceRecord } from '../src/database/port';
import { Inventory, cameraSourceOf, type OnlineChange } from '../src/state/inventory';
import { testDatabase, type TestDatabase } from './support/database';
import { CAMERA, GATEWAY, LAMP } from './support/fake-provider';

const open: TestDatabase[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((db) => db.close()));
});

async function subject(db?: TestDatabase): Promise<{
  db: TestDatabase;
  inventory: Inventory;
  online: OnlineChange[];
  changed: (readonly DeviceRecord[])[];
}> {
  const online: OnlineChange[] = [];
  const changed: (readonly DeviceRecord[])[] = [];
  const used = db ?? (await testDatabase());
  if (db === undefined) open.push(used);
  const inventory = new Inventory(used.database, {
    onlineChanged: (change): void => {
      online.push(change);
    },
    devicesChanged: (devices): void => {
      changed.push(devices);
    },
  });
  return { db: used, inventory, online, changed };
}

const roomId = (db: TestDatabase, name: string): string | undefined =>
  db.store.rooms.list().find((room) => room.name === name)?.id;

describe('Inventory', () => {
  it('stores discovered devices, links children to parents and places new devices in the provider rooms that already exist', async () => {
    const { db, inventory, changed } = await subject();
    db.store.rooms.create('Study', 0);
    const records = await inventory.apply('xiaomi', [CAMERA, GATEWAY, LAMP]);
    const gateway = inventory.deviceOf('xiaomi', 'gateway-1');
    const camera = inventory.deviceOf('xiaomi', 'camera-1');
    expect(records.map((device) => device.externalId)).toStrictEqual([
      'camera-1',
      'gateway-1',
      'lamp-1',
    ]);
    expect(camera?.parentId).toBe(gateway?.id);
    expect(inventory.deviceOf('xiaomi', 'lamp-1')?.roomId).toBe(roomId(db, 'Study'));
    expect(
      db.store.rooms
        .list()
        .map((room) => room.name)
        .sort(),
    ).toStrictEqual(['Study']);
    expect(inventory.deviceOf('xiaomi', 'camera-1')?.roomId).toBeNull();
    expect(db.store.devices.byId(camera?.id ?? '').provider_room).toBe('Hall');
    expect(changed).toHaveLength(1);
    expect(inventory.devicesOf('xiaomi')).toHaveLength(3);
    expect(inventory.devicesOf('tuya')).toHaveLength(0);
    expect(inventory.all()).toHaveLength(3);
  });

  it('registers cameras with their stream name, source scheme, PTZ and talk support', async () => {
    const { db, inventory } = await subject();
    await inventory.apply('xiaomi', [CAMERA]);
    const camera = inventory.deviceOf('xiaomi', 'camera-1');
    expect(db.store.cameras.list()).toMatchObject([
      {
        device_id: camera?.id,
        stream_name: camera?.id,
        source_url_kind: 'rtsp',
        physical_ptz: true,
        two_way_audio: false,
        record_events: true,
      },
    ]);
    expect(camera === undefined ? null : cameraSourceOf(camera)).toBe('rtsp://camera.local/stream');
  });

  it('refuses a camera source without a scheme', async () => {
    const { inventory } = await subject();
    await expect(
      inventory.apply('xiaomi', [{ ...CAMERA, details: { go2rtcSource: '/dev/video0' } }]),
    ).rejects.toThrow(
      'Camera camera-1 has no usable go2rtc source; expected a URL with a scheme, received "/dev/video0".',
    );
  });

  it('refuses a device reported by the wrong provider', async () => {
    const { inventory } = await subject();
    await expect(inventory.apply('tuya', [LAMP])).rejects.toThrow(
      'The tuya adapter reported device lamp-1 as a xiaomi device; every device it reports must be a tuya device.',
    );
  });

  it('announces online changes of known devices only', async () => {
    const { inventory, online } = await subject();
    await inventory.apply('xiaomi', [LAMP]);
    await inventory.apply('xiaomi', [{ ...LAMP, online: false }]);
    await inventory.apply('xiaomi', [{ ...LAMP, online: false }]);
    await inventory.apply('xiaomi', [{ ...LAMP, online: true }]);
    expect(online.map((change) => change.online)).toStrictEqual([false, true]);
  });

  it('never creates a room for a provider room name that matches none', async () => {
    const { db, inventory } = await subject();
    await inventory.apply('xiaomi', [LAMP]);
    await inventory.apply('xiaomi', [{ ...LAMP, room: 'Kitchen' }]);
    expect(roomId(db, 'Kitchen')).toBeUndefined();
  });

  it('places a known device that is still unplaced once its provider reports a room', async () => {
    const { db, inventory } = await subject();
    await inventory.apply('xiaomi', [{ ...LAMP, room: null }]);
    expect(inventory.deviceOf('xiaomi', 'lamp-1')?.roomId).toBeNull();
    db.store.rooms.create('Kitchen', 0);
    await inventory.apply('xiaomi', [{ ...LAMP, room: 'Kitchen' }]);
    expect(inventory.deviceOf('xiaomi', 'lamp-1')?.roomId).toBe(roomId(db, 'Kitchen'));
  });

  it('keeps an explicit user assignment when the provider names another existing room', async () => {
    const { db, inventory } = await subject();
    const study = db.store.rooms.create('Study', 0);
    db.store.rooms.create('Kitchen', 1);
    await inventory.apply('xiaomi', [{ ...LAMP, room: null }]);
    const lamp = inventory.deviceOf('xiaomi', 'lamp-1');
    db.store.devices.update(lamp?.id ?? '', { room_id: study.id });
    await inventory.load();
    await inventory.apply('xiaomi', [{ ...LAMP, room: 'Kitchen' }]);
    expect(db.store.devices.byId(lamp?.id ?? '').room_id).toBe(study.id);
  });

  it('loads what is already stored and marks a provider offline', async () => {
    const db = await testDatabase();
    open.push(db);
    await (await subject(db)).inventory.apply('xiaomi', [LAMP, GATEWAY]);
    const { inventory, online } = await subject(db);
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
