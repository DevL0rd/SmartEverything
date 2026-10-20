import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deviceDetails } from '../../src/extensions/mcp/tools/devices';
import { placedDevice } from '../../src/extensions/mcp/tools/targets';
import { captureLogs } from '../support/logs';
import { OWNER } from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
});

afterEach(async () => {
  await opened.close();
});

function add(kind: 'television' | 'light', externalId: string): string {
  const [row] = opened.store.devices.upsert([
    {
      provider: 'smartthings',
      externalId,
      parentId: null,
      kind,
      name: externalId,
      model: 'm',
      manufacturer: 'v',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: {},
    },
  ]);
  if (row === undefined) throw new Error('The device was not stored.');
  return row.id;
}

function detailsOf(id: string): Record<string, unknown> {
  const device = deviceDetails(opened.store, null, OWNER, placedDevice(opened.store, null, id))[
    'device'
  ];
  if (typeof device !== 'object' || device === null) throw new Error('No device part.');
  return Object.fromEntries(Object.entries(device));
}

describe('what the AI reads about a television', () => {
  it('shows a television without settings as not linked directly and without input names', () => {
    expect(detailsOf(add('television', 'tv-1'))['television']).toEqual({
      direct_link: null,
      wake_address: null,
      last_wake_worked_at: null,
      input_names: {},
    });
  });

  it('shows the direct link and the names given to the inputs', () => {
    const id = add('television', 'tv-1');
    opened.store.televisionSettings.setInputNames(id, { HDMI1: 'Console' });
    opened.store.televisionSettings.setDirectLinks([
      { deviceId: id, host: '192.168.1.40', macAddress: 'a1:b2:c3:d4:e5:f6' },
    ]);
    expect(detailsOf(id)['television']).toEqual({
      direct_link: { address: '192.168.1.40', mac: 'a1:b2:c3:d4:e5:f6' },
      wake_address: null,
      last_wake_worked_at: null,
      input_names: { HDMI1: 'Console' },
    });
  });

  it('shows the wake address and when a wake last worked', () => {
    const id = add('television', 'tv-2');
    opened.store.televisionSettings.setWakeAddress(id, 'a1:b2:c3:d4:e5:f6');
    opened.store.televisionSettings.recordWakeWorked(id, '2026-10-18T12:00:00.000Z');
    expect(detailsOf(id)['television']).toEqual({
      direct_link: null,
      wake_address: 'a1:b2:c3:d4:e5:f6',
      last_wake_worked_at: '2026-10-18T12:00:00.000Z',
      input_names: {},
    });
  });

  it('leaves the television part out for any other device', () => {
    expect(detailsOf(add('light', 'lamp-1'))).not.toHaveProperty('television');
  });
});
