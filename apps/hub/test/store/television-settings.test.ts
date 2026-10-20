import type { RowChange } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DeviceUpsert } from '../../src/database/port';
import type { DirectAddress } from '../../src/store/repositories/television-settings';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;

const MAC_ONE = 'a1:b2:c3:d4:e5:f6';

const MAC_TWO = '10:20:30:40:50:60';

function link(deviceId: string, host: string, macAddress: string): DirectAddress {
  return { deviceId, host, macAddress };
}

function television(externalId: string): DeviceUpsert {
  return {
    provider: 'smartthings',
    externalId,
    parentId: null,
    kind: 'television',
    name: 'TV',
    model: 'QN90',
    manufacturer: 'Samsung',
    providerRoom: null,
    roomId: null,
    online: true,
    capabilities: [],
    details: {},
  };
}

function add(externalId: string): string {
  const [row] = opened.store.devices.upsert([television(externalId)]);
  if (row === undefined) throw new Error('The television was not stored.');
  return row.id;
}

function feed(): RowChange[] {
  const seen: RowChange[] = [];
  opened.store.feed.subscribe((change) => seen.push(change));
  return seen;
}

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
});

afterEach(async () => {
  await opened.close();
});

describe('television settings', () => {
  it('has nothing for a television nobody has set up', () => {
    const id = add('tv-1');
    expect(opened.store.televisionSettings.find(id)).toBeUndefined();
    expect(opened.store.televisionSettings.list()).toEqual([]);
  });

  it('stores the input names and replaces them as a whole', () => {
    const id = add('tv-1');
    const seen = feed();
    opened.store.televisionSettings.setInputNames(id, { HDMI1: 'Console', HDMI2: 'Laptop' });
    const replaced = opened.store.televisionSettings.setInputNames(id, { HDMI2: 'PC' });
    expect(replaced).toEqual({
      device_id: id,
      direct_host: null,
      direct_mac: null,
      input_names: { HDMI2: 'PC' },
      wake_macs: [],
      wake_worked_at: null,
    });
    expect(seen.map((change) => `${change.table}:${change.operation}`)).toEqual([
      'television_settings:INSERT',
      'television_settings:UPDATE',
    ]);
  });

  it('keeps the input names when the direct link changes', () => {
    const id = add('tv-1');
    opened.store.televisionSettings.setInputNames(id, { HDMI1: 'Console' });
    opened.store.televisionSettings.setDirectLinks([link(id, '192.168.1.40', MAC_ONE)]);
    expect(opened.store.televisionSettings.find(id)).toEqual({
      device_id: id,
      direct_host: '192.168.1.40',
      direct_mac: MAC_ONE,
      input_names: { HDMI1: 'Console' },
      wake_macs: [],
      wake_worked_at: null,
    });
  });

  it('keeps one direct link per screen, announces only real changes and follows a new address', () => {
    const first = add('tv-1');
    const second = add('tv-2');
    const seen = feed();
    const both = [link(first, '192.168.1.40', MAC_ONE), link(second, '192.168.1.41', MAC_TWO)];
    opened.store.televisionSettings.setDirectLinks(both);
    opened.store.televisionSettings.setDirectLinks(both);
    opened.store.televisionSettings.setDirectLinks([
      link(first, '192.168.1.50', MAC_ONE),
      link(second, '192.168.1.41', MAC_TWO),
    ]);
    expect(opened.store.televisionSettings.find(first)?.direct_host).toBe('192.168.1.50');
    expect(opened.store.televisionSettings.find(second)?.direct_mac).toBe(MAC_TWO);
    expect(seen.map((change) => `${change.table}:${change.operation}`)).toEqual([
      'television_settings:INSERT',
      'television_settings:INSERT',
      'television_settings:UPDATE',
    ]);
  });

  it('clears the link of a screen that is no longer linked', () => {
    const id = add('tv-1');
    const other = add('tv-2');
    opened.store.televisionSettings.setDirectLinks([
      link(id, '192.168.1.40', MAC_ONE),
      link(other, '192.168.1.41', MAC_TWO),
    ]);
    opened.store.televisionSettings.setDirectLinks([link(other, '192.168.1.41', MAC_TWO)]);
    expect(opened.store.televisionSettings.find(id)).toMatchObject({
      direct_host: null,
      direct_mac: null,
    });
    opened.store.televisionSettings.setDirectLinks([]);
    expect(opened.store.televisionSettings.find(other)?.direct_mac).toBeNull();
  });

  it('marks nothing when the linked television is not in the inventory', () => {
    const id = add('tv-1');
    const seen = feed();
    opened.store.televisionSettings.setDirectLinks([
      link('00000000-0000-4000-8000-000000000000', '192.168.1.40', MAC_ONE),
    ]);
    expect(opened.store.televisionSettings.list()).toEqual([]);
    expect(seen).toEqual([]);
    expect(opened.store.televisionSettings.find(id)).toBeUndefined();
  });

  it('forgets the settings with the television', () => {
    const id = add('tv-1');
    opened.store.televisionSettings.setDirectLinks([link(id, '192.168.1.40', MAC_ONE)]);
    opened.store.devices.remove([id]);
    expect(opened.store.televisionSettings.list()).toEqual([]);
  });

  it('stores one wake address, keeps the names, forgets when it last worked and announces the change', () => {
    const id = add('tv-1');
    opened.store.televisionSettings.setInputNames(id, { HDMI1: 'Console' });
    const seen = feed();
    opened.store.televisionSettings.setWakeAddress(id, 'a1:b2:c3:d4:e5:f6');
    const worked = opened.store.televisionSettings.recordWakeWorked(id, '2026-10-18T12:00:00.000Z');
    expect(worked.wake_worked_at).toBe('2026-10-18T12:00:00.000Z');
    const moved = opened.store.televisionSettings.setWakeAddress(id, '10:20:30:40:50:60');
    expect(moved).toEqual({
      device_id: id,
      direct_host: null,
      direct_mac: null,
      input_names: { HDMI1: 'Console' },
      wake_macs: ['10:20:30:40:50:60'],
      wake_worked_at: null,
    });
    expect(seen.map((change) => [change.table, change.operation])).toEqual([
      ['television_settings', 'UPDATE'],
      ['television_settings', 'UPDATE'],
      ['television_settings', 'UPDATE'],
    ]);
  });

  it('clears the wake address', () => {
    const id = add('tv-1');
    opened.store.televisionSettings.setWakeAddress(id, 'a1:b2:c3:d4:e5:f6');
    expect(opened.store.televisionSettings.setWakeAddress(id, null).wake_macs).toEqual([]);
  });
});
