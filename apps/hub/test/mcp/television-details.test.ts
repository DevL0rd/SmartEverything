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
      direct_link: false,
      input_names: {},
    });
  });

  it('shows the direct link and the names given to the inputs', () => {
    const id = add('television', 'tv-1');
    opened.store.televisionSettings.setInputNames(id, { HDMI1: 'Console' });
    opened.store.televisionSettings.setDirectLink(id);
    expect(detailsOf(id)['television']).toEqual({
      direct_link: true,
      input_names: { HDMI1: 'Console' },
    });
  });

  it('leaves the television part out for any other device', () => {
    expect(detailsOf(add('light', 'lamp-1'))).not.toHaveProperty('television');
  });
});
