import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { xiaomiStreamOf } from '../src/services';
import { captureLogs } from './support/logs';
import { testStore, type TestStore } from './support/store';

let opened: TestStore;

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
});

afterEach(async () => {
  await opened.close();
});

function camera(provider: 'xiaomi' | 'tuya', externalId: string): string {
  const [device] = opened.store.devices.upsert([
    {
      provider,
      externalId,
      parentId: null,
      kind: 'camera',
      name: 'Camera',
      model: 'chuangmi.camera.v1',
      manufacturer: 'Xiaomi',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: {},
    },
  ]);
  if (device === undefined) {
    throw new Error('the device was not stored');
  }
  return device.id;
}

describe('xiaomiStreamOf', () => {
  it('names the go2rtc stream of the hub camera for a Xiaomi did, and null when there is none', () => {
    const withStream = camera('xiaomi', '1001');
    camera('xiaomi', '1002');
    const tuya = camera('tuya', '1003');
    opened.store.cameras.upsert([
      {
        deviceId: withStream,
        streamName: withStream,
        sourceUrlKind: 'xiaomi',
        physicalPtz: true,
        twoWayAudio: false,
      },
      {
        deviceId: tuya,
        streamName: tuya,
        sourceUrlKind: 'rtsp',
        physicalPtz: false,
        twoWayAudio: false,
      },
    ]);
    const streamOf = xiaomiStreamOf(opened.store);
    expect(streamOf('1001')).toBe(withStream);
    expect(streamOf('1002')).toBeNull();
    expect(streamOf('1003')).toBeNull();
    expect(streamOf('unknown')).toBeNull();
  });

  it('finds the camera by its did without reading the whole device and camera tables', () => {
    const id = camera('xiaomi', '2001');
    opened.store.cameras.upsert([
      {
        deviceId: id,
        streamName: id,
        sourceUrlKind: 'xiaomi',
        physicalPtz: false,
        twoWayAudio: false,
      },
    ]);
    const devices = vi.spyOn(opened.store.devices, 'list');
    const cameras = vi.spyOn(opened.store.cameras, 'list');
    expect(xiaomiStreamOf(opened.store)('2001')).toBe(id);
    expect(devices).not.toHaveBeenCalled();
    expect(cameras).not.toHaveBeenCalled();
  });
});
