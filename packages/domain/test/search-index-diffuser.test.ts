import { describe, expect, it } from 'vitest';
import { buildSearchIndex, type SearchDevice, type SearchSources } from '../src';

const DIFFUSER: SearchDevice = {
  id: 'diffuser',
  name: 'Diffuser',
  room: 'Bedroom',
  kind: 'other',
  model: 'xiaomi.diffuser.xw2iv',
  online: true,
  favourite: false,
  capabilities: [
    {
      key: 'raw:3.3',
      label: 'Colour',
      access: 'read_write',
      value: { kind: 'number', min: 0, max: 16_777_215, step: 1 },
    },
    { key: 'raw:action.4.1', label: 'Spray now', access: 'write', value: { kind: 'action' } },
    {
      key: 'raw:action.4.2',
      label: 'Spray with options',
      access: 'write',
      value: { kind: 'action', arguments: ['strength'] },
    },
  ],
  state: {},
};

function sources(overrides: Partial<SearchSources>): SearchSources {
  return {
    devices: [DIFFUSER],
    rooms: [],
    pages: [],
    settings: [],
    scenes: [],
    automations: [],
    irRemotes: [],
    cameras: [],
    ...overrides,
  };
}

describe('the search index of a device with a packed colour', () => {
  const entries = buildSearchIndex(sources({})).entries;

  it('offers to open the colour control but never to set a number as a colour', () => {
    const colour = entries.filter((entry) => entry.id.includes('raw:3.3'));
    expect(colour).toHaveLength(1);
    expect(colour[0]).toMatchObject({ run: null, runLabel: null, openLabel: 'Open' });
  });

  it('lets an action without arguments run as it is and offers only to open one that needs them', () => {
    const spray = entries.find((entry) => entry.id.includes('raw:action.4.1'));
    const options = entries.find((entry) => entry.id.includes('raw:action.4.2'));
    expect(spray?.run).not.toBeNull();
    expect(options?.run).toBeNull();
  });
});

describe('the search index of a room', () => {
  it('says one device in the singular', () => {
    const [room] = buildSearchIndex(
      sources({ devices: [], rooms: [{ id: 'bed', name: 'Bedroom', deviceCount: 1 }] }),
    ).entries;
    expect(room?.detail).toBe('1 device');
  });
});
