import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  LEARN_FOCUS,
  buildSearchIndex,
  devicePageEntries,
  focusOf,
  historyFocus,
  learnRemoteFocus,
  searchIndex,
  typedNumberEntries,
  type SearchDevice,
  type SearchEntry,
  type SearchIrRemote,
  type SearchOptions,
  type SearchSources,
} from '../src';

const purifier: SearchDevice = {
  id: 'purifier',
  name: 'Living room purifier',
  room: 'Living room',
  kind: 'air_purifier',
  online: true,
  favourite: false,
  capabilities: [
    { key: 'power', label: 'Power', access: 'read_write', value: { kind: 'boolean' } },
    {
      key: 'purifier_mode',
      label: 'Purifier mode',
      access: 'read_write',
      value: { kind: 'enum', options: ['Auto', 'Sleep', 'Turbo'] },
    },
    {
      key: 'pm25',
      label: 'PM2.5',
      access: 'read',
      value: { kind: 'number', min: 0, max: 999, step: 1, unit: 'µg/m³' },
    },
    {
      key: 'fan_speed',
      label: 'Fan level',
      access: 'read_write',
      value: { kind: 'number', min: 1, max: 14, step: 1 },
    },
  ],
  state: { power: true },
};

const blaster: SearchDevice = {
  id: 'blaster',
  name: 'IR hub',
  room: null,
  kind: 'ir_blaster',
  online: true,
  favourite: false,
  capabilities: [
    {
      key: 'ir_send',
      label: 'Send IR code',
      access: 'write',
      value: { kind: 'action', arguments: ['format', 'code'] },
    },
    { key: 'ir_learn', label: 'Learn IR code', access: 'write', value: { kind: 'action' } },
  ],
  state: {},
};

const listener: SearchDevice = {
  ...blaster,
  id: 'listener',
  name: 'Read-only blaster',
  room: 'Hall',
  capabilities: [
    { key: 'ir_learn', label: 'Learn IR code', access: 'read', value: { kind: 'action' } },
  ],
};

const tvRemote: SearchIrRemote = {
  id: 'tv-remote',
  name: 'Bedroom TV',
  category: 'tv',
  brand: 'Sony',
  blasterId: 'blaster',
  pageDeviceId: 'tv-device',
  buttons: [{ button: 'Power', format: 'pulses', code: 'power-pulses' }],
};

const fanRemote: SearchIrRemote = {
  id: 'fan-remote',
  name: 'Desk fan',
  category: 'fan',
  brand: null,
  blasterId: 'blaster',
  pageDeviceId: 'blaster',
  buttons: [],
};

const sources: SearchSources = {
  devices: [purifier, blaster, listener],
  rooms: [],
  pages: [],
  settings: [],
  scenes: [],
  automations: [],
  irRemotes: [tvRemote, fanRemote],
  cameras: [],
};

const options: SearchOptions = { recent: {}, now: 0, limit: 50, group: null };

function entry(id: string): SearchEntry {
  const found = devicePageEntries(sources).find((candidate) => candidate.id === id);
  if (found === undefined) {
    throw new Error(`no entry ${id}`);
  }
  return found;
}

function titles(query: string): string[] {
  return searchIndex(buildSearchIndex(sources), query, options).map((result) => result.entry.title);
}

describe('device page focus', () => {
  it('names the history of a capability and the learning of a remote', () => {
    expect(historyFocus('pm25')).toBe('history:pm25');
    expect(learnRemoteFocus('tv-remote')).toBe('learn:tv-remote');
    expect(LEARN_FOCUS).toBe('learn');
  });

  it('reads back every focus it writes', () => {
    expect(focusOf(historyFocus('raw:siid:2'))).toStrictEqual({
      kind: 'history',
      capability: 'raw:siid:2',
    });
    expect(focusOf(learnRemoteFocus('tv-remote'))).toStrictEqual({
      kind: 'learn',
      remoteId: 'tv-remote',
    });
    expect(focusOf(LEARN_FOCUS)).toStrictEqual({ kind: 'learn', remoteId: null });
  });

  it('treats anything else as no focus', () => {
    for (const written of [null, '', 'history', 'history:', 'learn:', 'other:pm25']) {
      expect(focusOf(written)).toStrictEqual({ kind: 'none' });
    }
  });

  it('never throws on text from a link', () => {
    fc.assert(
      fc.property(fc.string(), (written) => {
        expect(['none', 'history', 'learn']).toContain(focusOf(written).kind);
      }),
    );
  });
});

describe('device page entries', () => {
  it('opens the full page of every device', () => {
    expect(entry('device-page:purifier')).toStrictEqual({
      id: 'device-page:purifier',
      group: 'page',
      title: 'Living room purifier — full page',
      detail: 'Living room · Living room purifier',
      keywords: ['page', 'details', 'history', 'events', 'settings', 'air purifier', 'Living room'],
      state: null,
      run: null,
      runLabel: null,
      open: { kind: 'device-page', deviceId: 'purifier', focus: null },
      openLabel: 'Open',
      suggested: false,
    });
    expect(entry('device-page:blaster').keywords).toStrictEqual([
      'page',
      'details',
      'history',
      'events',
      'settings',
      'ir blaster',
    ]);
  });

  it('shows the history of every number, readable or writable', () => {
    expect(entry('history:purifier:pm25')).toStrictEqual({
      id: 'history:purifier:pm25',
      group: 'page',
      title: 'PM2.5 history — Living room purifier',
      detail: 'Living room · Living room purifier',
      keywords: [
        'history',
        'chart',
        'graph',
        'trend',
        'show',
        'Living room purifier',
        'air purifier',
        'Living room',
        'PM2.5',
        'pm25',
        'air quality',
        'dust',
      ],
      state: null,
      run: { kind: 'device-page', deviceId: 'purifier', focus: 'history:pm25' },
      runLabel: 'Show',
      open: { kind: 'device-page', deviceId: 'purifier', focus: 'history:pm25' },
      openLabel: 'Open',
      suggested: false,
    });
    expect(entry('history:purifier:fan_speed').title).toBe(
      'Fan level history — Living room purifier',
    );
    expect(devicePageEntries(sources).map((found) => found.id)).not.toContain(
      'history:purifier:purifier_mode',
    );
  });

  it('learns a new button only on a blaster that can be asked to learn', () => {
    expect(entry('learn:blaster')).toStrictEqual({
      id: 'learn:blaster',
      group: 'action',
      title: 'Learn a new remote button — IR hub',
      detail: 'IR hub',
      keywords: [
        'ir',
        'infrared',
        'remote',
        'learn',
        'teach',
        'new',
        'button',
        'tv',
        'air conditioner',
      ],
      state: null,
      run: { kind: 'device-page', deviceId: 'blaster', focus: 'learn' },
      runLabel: 'Learn',
      open: { kind: 'device-page', deviceId: 'blaster', focus: 'learn' },
      openLabel: 'Open',
      suggested: false,
    });
    expect(devicePageEntries(sources).map((found) => found.id)).not.toContain('learn:listener');
    expect(devicePageEntries(sources).map((found) => found.id)).not.toContain('learn:purifier');
  });

  it('learns a button for each remote and presses each learned button', () => {
    expect(entry('learn-remote:tv-remote')).toStrictEqual({
      id: 'learn-remote:tv-remote',
      group: 'action',
      title: 'Learn a new button — Bedroom TV',
      detail: 'Sony tv remote',
      keywords: [
        'button',
        'Bedroom TV',
        'tv',
        'Sony',
        'ir',
        'infrared',
        'remote',
        'learn',
        'teach',
        'new',
      ],
      state: null,
      run: { kind: 'device-page', deviceId: 'tv-device', focus: 'learn:tv-remote' },
      runLabel: 'Learn',
      open: { kind: 'device-page', deviceId: 'tv-device', focus: 'learn:tv-remote' },
      openLabel: 'Open',
      suggested: false,
    });
    expect(entry('ir:tv-remote:Power')).toStrictEqual({
      id: 'ir:tv-remote:Power',
      group: 'action',
      title: 'Power — Bedroom TV',
      detail: 'Sony tv remote',
      keywords: [
        'press',
        'button',
        'send',
        'Bedroom TV',
        'tv',
        'Sony',
        'ir',
        'infrared',
        'remote',
        'learn',
        'teach',
        'new',
      ],
      state: null,
      run: {
        kind: 'command',
        deviceId: 'blaster',
        capability: 'ir_send',
        value: { format: 'pulses', code: 'power-pulses' },
      },
      runLabel: 'Press',
      open: { kind: 'device-page', deviceId: 'tv-device', focus: null },
      openLabel: 'Open',
      suggested: false,
    });
    expect(entry('learn-remote:fan-remote').detail).toBe('fan remote');
    expect(entry('learn-remote:fan-remote').keywords).toStrictEqual([
      'button',
      'Desk fan',
      'fan',
      'ir',
      'infrared',
      'remote',
      'learn',
      'teach',
      'new',
    ]);
  });
});

describe('finding what a person says', () => {
  it('finds a mode said as a sentence', () => {
    expect(titles('set living room purifier to sleep')[0]).toBe(
      'Purifier mode → Sleep — Living room purifier',
    );
  });

  it('finds a typed value said as a sentence', () => {
    expect(titles('set purifier fan level to 7')).toStrictEqual([
      'Fan level 7 — Living room purifier',
    ]);
    expect(typedNumberEntries(buildSearchIndex(sources), 7)[0]?.keywords).toContain('to');
  });

  it('does not add setting words to switches', () => {
    const index = buildSearchIndex(sources);
    const on = index.entries.find((found) => found.id === 'action:purifier:power:true');
    expect(on?.keywords).not.toContain('set');
  });

  it('finds a history and a remote to learn', () => {
    expect(titles('show pm2.5 history')).toStrictEqual(['PM2.5 history — Living room purifier']);
    expect(titles('learn a new tv remote button').slice(0, 2)).toStrictEqual([
      'Learn a new button — Bedroom TV',
      'Learn a new remote button — IR hub',
    ]);
    expect(titles('press bedroom tv power')).toStrictEqual(['Power — Bedroom TV']);
  });
});
