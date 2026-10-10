import { describe, expect, it } from 'vitest';
import {
  buildSearchIndex,
  searchIndex,
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
  kind: 'pan_tilt_camera',
  room: null,
  online: false,
  twoWayAudio: false,
};

const nurseryDevice: SearchDevice = {
  id: 'nursery',
  name: 'Nursery camera',
  room: 'Nursery',
  kind: 'camera',
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
  return searchIndex(buildSearchIndex(sources), query, {
    recent: {},
    now: 0,
    limit: 5,
    group: null,
  })[0]?.entry.id;
}

describe('camera search entries', () => {
  it('shows every camera live, with its room and the words people use', () => {
    expect(entry('camera:door:show')).toStrictEqual({
      id: 'camera:door:show',
      group: 'action',
      title: 'Show Front door',
      detail: 'Entry · Live view',
      keywords: ['camera', 'live', 'view', 'watch', 'see', 'open', 'video', 'doorbell', 'Entry'],
      state: null,
      run: { kind: 'camera', deviceId: 'door', talk: false },
      runLabel: 'Show',
      open: { kind: 'camera', deviceId: 'door', talk: false },
      openLabel: 'Open',
      suggested: false,
    });
    expect(entry('camera:nursery:show')).toMatchObject({
      detail: 'Live view',
      keywords: ['camera', 'live', 'view', 'watch', 'see', 'open', 'video', 'pan tilt camera'],
      state: 'Offline',
    });
  });

  it('offers talk only for cameras with a speaker', () => {
    expect(entry('camera:door:talk')).toMatchObject({
      title: 'Talk to Front door',
      keywords: ['camera', 'speak', 'intercom', 'microphone', 'answer', 'doorbell', 'Entry'],
      run: { kind: 'camera', deviceId: 'door', talk: true },
      runLabel: 'Talk',
    });
    expect(() => entry('camera:nursery:talk')).toThrow('no entry camera:nursery:talk');
  });

  it('opens the wall, grid and focus layouts as pages', () => {
    expect(entry('camera-view:wall')).toStrictEqual({
      id: 'camera-view:wall',
      group: 'page',
      title: 'Camera wall',
      detail: 'Cameras and widgets, arranged freely',
      keywords: [
        'open',
        'cameras',
        'page',
        'control centre',
        'control center',
        'kiosk',
        'dashboard',
        'widgets',
      ],
      state: null,
      run: { kind: 'camera-view', view: 'wall' },
      runLabel: 'Open',
      open: { kind: 'camera-view', view: 'wall' },
      openLabel: 'Go',
      suggested: false,
    });
    expect(entry('camera-view:grid')).toMatchObject({
      title: 'Camera grid',
      detail: 'One to nine cameras side by side',
      keywords: ['open', 'cameras', 'page', 'tiles', 'all cameras', '2x2', '3x3'],
    });
    expect(entry('camera-view:focus')).toMatchObject({
      title: 'Camera focus',
      detail: 'One large camera and the others in a strip',
      keywords: ['open', 'cameras', 'page', 'large', 'big', 'single'],
    });
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

  it('finds the camera, talk, privacy and the wall first', () => {
    expect(first('Show front door camera')).toBe('camera:door:show');
    expect(first('Talk to doorbell')).toBe('camera:door:talk');
    expect(first('Turn on privacy for nursery camera')).toBe('action:nursery:privacy_mode:true');
    expect(first('Open camera wall')).toBe('camera-view:wall');
  });
});
