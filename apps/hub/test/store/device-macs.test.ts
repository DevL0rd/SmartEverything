import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;

const MOMENT = '2026-10-21T12:00:00.000Z';

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
});

afterEach(async () => {
  await opened.close();
});

function camera(): string {
  const [device] = opened.store.devices.upsert([
    {
      provider: 'xiaomi',
      externalId: 'cam-1',
      parentId: null,
      kind: 'camera',
      name: 'Camera',
      model: 'c',
      manufacturer: 'Xiaomi',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: {},
    },
  ]);
  return device?.id ?? '';
}

describe('device MAC addresses', () => {
  it('keeps the MAC address learned for a device and replaces it when it is learned again', () => {
    const id = camera();
    opened.store.deviceMacs.remember(id, 'b8:88:80:d7:19:ac', MOMENT);
    expect(opened.store.deviceMacs.all().get(id)).toBe('b8:88:80:d7:19:ac');
    opened.store.deviceMacs.remember(id, 'b8:88:80:d7:28:57', MOMENT);
    expect([...opened.store.deviceMacs.all()]).toStrictEqual([[id, 'b8:88:80:d7:28:57']]);
  });

  it('refuses a MAC address that is not in the lower-case colon form', () => {
    const id = camera();
    expect(() => {
      opened.store.deviceMacs.remember(id, 'B8-88-80-D7-19-AC', MOMENT);
    }).toThrow('MAC address');
  });

  it('forgets the MAC address with its device', () => {
    const id = camera();
    opened.store.deviceMacs.remember(id, 'b8:88:80:d7:19:ac', MOMENT);
    opened.store.devices.remove([id]);
    expect(opened.store.deviceMacs.all().size).toBe(0);
  });
});
