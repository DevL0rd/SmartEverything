import type { RowChange } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DeviceUpsert } from '../../src/database/port';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;

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
    expect(replaced).toEqual({ device_id: id, direct_link: false, input_names: { HDMI2: 'PC' } });
    expect(seen.map((change) => `${change.table}:${change.operation}`)).toEqual([
      'television_settings:INSERT',
      'television_settings:UPDATE',
    ]);
  });

  it('keeps the input names when the direct link changes', () => {
    const id = add('tv-1');
    opened.store.televisionSettings.setInputNames(id, { HDMI1: 'Console' });
    opened.store.televisionSettings.setDirectLink(id);
    expect(opened.store.televisionSettings.find(id)).toEqual({
      device_id: id,
      direct_link: true,
      input_names: { HDMI1: 'Console' },
    });
  });

  it('marks one television as linked directly and moves the mark when the link moves', () => {
    const first = add('tv-1');
    const second = add('tv-2');
    const seen = feed();
    opened.store.televisionSettings.setDirectLink(first);
    opened.store.televisionSettings.setDirectLink(first);
    opened.store.televisionSettings.setDirectLink(second);
    expect(opened.store.televisionSettings.find(first)?.direct_link).toBe(false);
    expect(opened.store.televisionSettings.find(second)?.direct_link).toBe(true);
    expect(seen.map((change) => `${change.table}:${change.operation}`)).toEqual([
      'television_settings:INSERT',
      'television_settings:UPDATE',
      'television_settings:INSERT',
    ]);
  });

  it('clears the mark when the link is removed', () => {
    const id = add('tv-1');
    opened.store.televisionSettings.setDirectLink(id);
    opened.store.televisionSettings.setDirectLink(null);
    expect(opened.store.televisionSettings.find(id)?.direct_link).toBe(false);
  });

  it('marks nothing when the linked television is not in the inventory', () => {
    const id = add('tv-1');
    const seen = feed();
    opened.store.televisionSettings.setDirectLink('00000000-0000-4000-8000-000000000000');
    expect(opened.store.televisionSettings.list()).toEqual([]);
    expect(seen).toEqual([]);
    expect(opened.store.televisionSettings.find(id)).toBeUndefined();
  });

  it('forgets the settings with the television', () => {
    const id = add('tv-1');
    opened.store.televisionSettings.setDirectLink(id);
    opened.store.devices.remove([id]);
    expect(opened.store.televisionSettings.list()).toEqual([]);
  });
});
