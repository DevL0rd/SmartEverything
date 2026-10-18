import { describe, expect, it } from 'vitest';
import {
  buildSearchIndex,
  rankSearch,
  tokensOf,
  type SearchCamera,
  type SearchDevice,
  type SearchEntry,
  type SearchSources,
} from '../src';

const doorbell: SearchCamera = {
  id: 'door',
  name: 'Front door',
  kind: 'doorbell',
  room: 'Entry',
  online: true,
  twoWayAudio: true,
};

const nursery: SearchCamera = {
  id: 'nursery',
  name: 'Nursery camera',
  kind: 'camera',
  room: null,
  online: false,
  twoWayAudio: false,
};

const nurseryDevice: SearchDevice = {
  id: 'nursery',
  name: 'Nursery camera',
  room: 'Nursery',
  kind: 'camera',
  model: 'Camera model',
  online: true,
  favourite: false,
  capabilities: [
    { key: 'privacy_mode', label: 'Privacy', access: 'read_write', value: { kind: 'boolean' } },
  ],
  state: { privacy_mode: false },
};

const doorDevice: SearchDevice = {
  ...nurseryDevice,
  id: 'door',
  name: 'Front door',
  room: 'Entry',
  kind: 'doorbell',
  capabilities: [],
  state: {},
};

const sources: SearchSources = {
  devices: [nurseryDevice, doorDevice],
  rooms: [],
  pages: [],
  settings: [],
  scenes: [],
  automations: [],
  irRemotes: [],
  cameras: [doorbell, nursery],
};

function entry(id: string): SearchEntry {
  const found = buildSearchIndex(sources).entries.find((candidate) => candidate.id === id);
  if (found === undefined) {
    throw new Error(`no entry ${id}`);
  }
  return found;
}

function first(query: string): string | undefined {
  return rankSearch(buildSearchIndex(sources), query, {
    recent: {},
    now: 0,
    limit: 5,
  })[0]?.entry.id;
}

describe('camera search entries', () => {
  it('shows every camera live, with its room and the words people use', () => {
    expect(entry('camera:door:show')).toStrictEqual({
      id: 'camera:door:show',
      group: 'action',
      title: 'Show Front door',
      detail: 'Entry · Live view',
      keywords: ['camera', 'live', 'view', 'watch', 'see', 'open', 'video', 'Doorbell', 'Entry'],
      state: null,
      run: { kind: 'camera', deviceId: 'door', talk: false },
      runLabel: 'Show',
      open: { kind: 'camera', deviceId: 'door', talk: false },
      openLabel: 'Open',
      suggested: false,
    });
    expect(entry('camera:nursery:show')).toMatchObject({
      detail: 'Live view',
      keywords: ['camera', 'live', 'view', 'watch', 'see', 'open', 'video', 'Camera'],
      state: 'Offline',
    });
  });

  it('offers talk only for cameras with a speaker', () => {
    expect(entry('camera:door:talk')).toMatchObject({
      title: 'Talk to Front door',
      keywords: ['camera', 'speak', 'intercom', 'microphone', 'answer', 'Doorbell', 'Entry'],
      run: { kind: 'camera', deviceId: 'door', talk: true },
      runLabel: 'Talk',
    });
    expect(() => entry('camera:nursery:talk')).toThrow('no entry camera:nursery:talk');
  });

  it('adds nothing for a home without cameras', () => {
    const ids = buildSearchIndex({ ...sources, cameras: [] }).entries.map((found) => found.id);
    expect(ids.filter((id) => id.startsWith('camera'))).toStrictEqual([]);
  });

  it('turns privacy on and off in words', () => {
    expect(entry('action:nursery:privacy_mode:true').title).toBe(
      'Turn on privacy — Nursery camera',
    );
    expect(entry('action:nursery:privacy_mode:false').title).toBe(
      'Turn off privacy — Nursery camera',
    );
  });
});

describe('asking for a camera in plain words', () => {
  it('ignores filler words in the query', () => {
    expect(tokensOf('Turn on the privacy for my nursery camera please')).toStrictEqual([
      'turn',
      'on',
      'privacy',
      'nursery',
      'camera',
    ]);
    expect(tokensOf('a an')).toStrictEqual([]);
  });

  it('finds the camera, talk and privacy first', () => {
    expect(first('Show front door camera')).toBe('camera:door:show');
    expect(first('Talk to doorbell')).toBe('camera:door:talk');
    expect(first('Turn on privacy for nursery camera')).toBe('action:nursery:privacy_mode:true');
  });
});
