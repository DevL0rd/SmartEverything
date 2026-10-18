import { join } from 'node:path';
import { BLE_ADVERT, type BleAdvert, type JsonValue } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PassiveObservations, type PassiveSource } from '../../src/local/passive-observations';
import { SecretStore } from '../../src/secrets/store';
import type { LocalDeviceEntry } from '../../src/store/repositories/local-devices';
import { testStore, type TestStore } from '../support/store';

const ADDRESS = 'AA:BB:CC:DD:EE:FF';
const KEY = '00112233445566778899aabbccddeeff';
const START = Date.parse('2026-10-08T10:00:00.000Z');

let opened: TestStore;
let clock = START;
let sources: (PassiveSource | null)[] = [];
let observations: PassiveObservations;
let entry: LocalDeviceEntry;

beforeEach(async () => {
  opened = await testStore();
  clock = START;
  sources = [];
  const secrets = await SecretStore.open(join(opened.directory, 'secrets'), Buffer.alloc(32, 3));
  const [device] = opened.store.devices.upsert([
    {
      provider: 'xiaomi',
      externalId: 'blt.3.door',
      parentId: null,
      kind: 'sensor',
      name: 'Door',
      model: 'isa.magnet.dw2hl',
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
  entry = opened.store.localDevices.add({
    externalId: 'blt.3.door',
    driver: 'xiaomi_magnet',
    address: ADDRESS,
    name: 'Door',
    config: { deviceId: device.id, model: 'isa.magnet.dw2hl', accountScope: 'scope' },
  });
  await secrets.saveDeviceKey(entry.externalId, KEY);
  observations = new PassiveObservations({
    store: opened.store,
    secrets,
    state: { commitObservation: (_row, commit): Promise<boolean> => Promise.resolve(commit()) },
    now: (): Date => new Date(clock),
    eligible: (): boolean => true,
    sourceChanged: (_id, source): void => {
      sources.push(source);
    },
  });
});

afterEach(async () => {
  await opened.close();
});

function advert(counter: number, contact: boolean, ageMs: number): BleAdvert {
  return BLE_ADVERT.parse({
    address: ADDRESS,
    serviceUuid: '0000fe95-0000-1000-8000-00805f9b34fb',
    data: `${counter.toString(16).padStart(8, '0')}0${contact ? '1' : '0'}`,
    rssi: -60,
    seenAt: new Date(clock - ageMs).toISOString(),
  });
}

function receive(counter: number, contact: boolean, ageMs = 0): Promise<boolean> {
  return observations.receive(entry, advert(counter, contact, ageMs), KEY, {
    kind: 'state',
    counter,
    contact,
  });
}

function stored(): JsonValue | undefined {
  const [device] = opened.store.devices.list();
  return device === undefined ? undefined : opened.store.state.value(device.id, 'contact');
}

describe('passive door observations', () => {
  it('accepts an advert that arrives later than the receiver freshness window', async () => {
    expect(await receive(5, true, 600_000)).toBe(true);
    expect(stored()).toBe(true);
    const last = sources.at(-1);
    expect(last?.freshUntil).toBeLessThan(clock);
    expect(last?.values.get('contact')).toBe(true);
  });

  it('refuses a repeated or older counter within the same run', async () => {
    expect(await receive(5, true)).toBe(true);
    expect(await receive(5, true)).toBe(false);
    clock += 1000;
    expect(await receive(4, false)).toBe(false);
    expect(stored()).toBe(true);
    clock += 1000;
    expect(await receive(6, false)).toBe(true);
    expect(stored()).toBe(false);
  });

  it('treats a lower counter after a gap as a reset after a battery change', async () => {
    expect(await receive(90_000, true)).toBe(true);
    clock += 5 * 60_000;
    expect(await receive(1, false)).toBe(true);
    expect(stored()).toBe(false);
    clock += 1000;
    expect(await receive(2, true)).toBe(true);
    expect(stored()).toBe(true);
  });

  it('keeps cloud updates suppressed only while the last broadcast is fresh', async () => {
    await receive(7, true);
    const status = observations.status(opened.store.devices.list()[0]?.id ?? '');
    expect(status.blockedReason).toBeNull();
    clock += 200_000;
    const stale = observations.status(opened.store.devices.list()[0]?.id ?? '');
    expect(stale.blockedReason).toBe('No recent Bluetooth broadcast; cloud updates are active.');
  });
});
