import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  describeCommandValue,
  EXACT_SCORE,
  RECENCY_WEIGHT,
  SEARCH_GROUPS,
  accepts,
  buildSearchIndex,
  countByGroup,
  deviceSummary,
  formatValue,
  isSubsequence,
  numberIn,
  numberPresets,
  recencyBoost,
  scoreEntry,
  searchIndex,
  tokenScore,
  tokensOf,
  typedNumberEntries,
  type DeviceCapability,
  type SearchDevice,
  type SearchEntry,
  type SearchOptions,
  type SearchSources,
  type ValueDescriptor,
} from '../src';

const DAY = 86_400_000;

const power: DeviceCapability = {
  key: 'power',
  label: 'Power',
  access: 'read_write',
  value: { kind: 'boolean' },
};

const purifier: SearchDevice = {
  id: 'purifier',
  name: 'Air purifier',
  room: 'Living room',
  kind: 'air_purifier',
  online: true,
  favourite: true,
  capabilities: [
    power,
    {
      key: 'purifier_mode',
      label: 'Mode',
      access: 'read_write',
      value: { kind: 'enum', options: ['Auto', 'Sleep'] },
    },
    {
      key: 'pm25',
      label: 'PM2.5',
      access: 'read',
      value: { kind: 'number', min: 0, max: 999, step: 1, unit: 'µg/m³' },
    },
    { key: 'filter_reset', label: 'Reset filter', access: 'write', value: { kind: 'action' } },
    {
      key: 'ir_send',
      label: 'Send IR code',
      access: 'write',
      value: { kind: 'action', arguments: ['format', 'code'] },
    },
    { key: 'color', label: 'Colour', access: 'read_write', value: { kind: 'color' } },
    {
      key: 'raw:led_text',
      label: 'Display text',
      access: 'write',
      value: { kind: 'text', maxLength: 12 },
    },
    { key: 'child_lock', label: 'Child lock', access: 'read_write', value: { kind: 'boolean' } },
  ],
  state: { power: true, purifier_mode: 'Auto', pm25: 9 },
};

const conditioner: SearchDevice = {
  id: 'conditioner',
  name: 'Air conditioner',
  room: 'Bedroom',
  kind: 'air_conditioner',
  online: true,
  favourite: false,
  capabilities: [
    power,
    {
      key: 'target_temperature',
      label: 'Target',
      access: 'read_write',
      value: { kind: 'number', min: 16, max: 30, step: 0.5, unit: '°C' },
    },
  ],
  state: { power: false },
};

const door: SearchDevice = {
  id: 'door',
  name: 'Front door',
  room: null,
  kind: 'lock',
  online: false,
  favourite: false,
  capabilities: [
    { key: 'lock', label: 'Lock', access: 'read_write', value: { kind: 'boolean' } },
    { key: 'mute', label: 'Chime', access: 'read_write', value: { kind: 'boolean' } },
  ],
  state: { lock: true },
};

const sensor: SearchDevice = {
  id: 'sensor',
  name: 'Leak sensor',
  room: 'Laundry',
  kind: 'sensor',
  online: true,
  favourite: false,
  capabilities: [
    { key: 'doorbell', label: 'Ring', access: 'read', value: { kind: 'action' } },
    { key: 'leak', label: 'Leak', access: 'read', value: { kind: 'boolean' } },
  ],
  state: { doorbell: null },
};

const sources: SearchSources = {
  devices: [purifier, conditioner, door, sensor],
  rooms: [{ id: 'living', name: 'Living room', deviceCount: 2 }],
  pages: [
    { path: '/climate', title: 'Climate', description: 'Purifier, humidifier', keywords: ['air'] },
  ],
  settings: [
    {
      id: 'accent:violet',
      title: 'Accent colour → Violet',
      section: 'Appearance',
      keywords: ['theme'],
      state: 'Amber',
      value: 'violet',
      runLabel: 'Set',
      path: '/more',
    },
    {
      id: 'members',
      title: 'Members',
      section: 'Home',
      keywords: [],
      state: null,
      value: undefined,
      runLabel: 'Set',
      path: '/settings',
    },
  ],
  scenes: [{ id: 'evening', name: 'Evening', path: '/automations' }],
  automations: [
    { id: 'porch', name: 'Porch lights at sunset', enabled: true, path: '/automations' },
    { id: 'cry', name: 'Baby cry call', enabled: false, path: '/automations' },
  ],
  irRemotes: [],
  cameras: [],
};

const options: SearchOptions = { recent: {}, now: 10 * DAY, limit: 50, group: null };

function entry(id: string): SearchEntry {
  const found = buildSearchIndex(sources).entries.find((candidate) => candidate.id === id);
  if (found === undefined) {
    throw new Error(`no entry ${id}`);
  }
  return found;
}

function titles(query: string, given: Partial<SearchOptions> = {}): string[] {
  return searchIndex(buildSearchIndex(sources), query, { ...options, ...given }).map(
    (result) => result.entry.title,
  );
}

describe('describing what a command asked for', () => {
  const target: DeviceCapability = {
    key: 'target_temperature',
    label: 'Target temperature',
    access: 'read_write',
    value: { kind: 'number', min: 16, max: 30, step: 0.5, unit: '°C' },
  };
  const reset: DeviceCapability = {
    key: 'filter_reset',
    label: 'Reset filter',
    access: 'write',
    value: { kind: 'action' },
  };

  it('names the setting and the value it was set to', () => {
    expect(describeCommandValue(target, { capability: 'target_temperature', value: 21 })).toBe(
      'Target temperature → 21.0°C',
    );
  });

  it('names an action by itself, since it carries no value', () => {
    expect(describeCommandValue(reset, { capability: 'filter_reset', value: null })).toBe(
      'Reset filter',
    );
  });

  it('shows the raw key and value when the device no longer has the capability', () => {
    expect(describeCommandValue(undefined, { capability: 'raw:2.1', value: { a: 1 } })).toBe(
      'raw:2.1 → {"a":1}',
    );
  });
});

describe('formatting a value', () => {
  it('writes numbers to the precision of their step, with their unit', () => {
    const target: ValueDescriptor = { kind: 'number', min: 16, max: 30, step: 0.5, unit: '°C' };
    expect(formatValue('target_temperature', target, 22)).toBe('22.0°C');
    expect(formatValue('x', { kind: 'number', min: 0, max: 1, step: 0.25, unit: '%' }, 0.5)).toBe(
      '0.50%',
    );
    expect(formatValue('pm25', { kind: 'number', min: 0, max: 9, step: 1, unit: 'µg/m³' }, 9)).toBe(
      '9 µg/m³',
    );
    expect(formatValue('fan', { kind: 'number', min: 0, max: 9, step: 1 }, 3)).toBe('3');
    expect(formatValue('x', { kind: 'number', min: 0, max: 1, step: 1e-7 }, 0.5)).toBe('1');
  });

  it('names a boolean the way its capability reads', () => {
    const descriptor: ValueDescriptor = { kind: 'boolean' };
    const named: readonly [string, string, string][] = [
      ['lock', 'Locked', 'Unlocked'],
      ['contact', 'Open', 'Closed'],
      ['motion', 'Motion', 'Clear'],
      ['occupancy', 'Occupied', 'Empty'],
      ['leak', 'Leak', 'Dry'],
      ['smoke', 'Smoke', 'Clear'],
      ['gas', 'Gas', 'Clear'],
      ['vibration', 'Shaking', 'Still'],
      ['tank_full', 'Full', 'Not full'],
      ['tank_empty', 'Empty', 'Has water'],
      ['power', 'On', 'Off'],
    ];
    for (const [key, yes, no] of named) {
      expect(formatValue(key, descriptor, true)).toBe(yes);
      expect(formatValue(key, descriptor, false)).toBe(no);
    }
  });

  it('shows text as it is and anything else as JSON', () => {
    expect(formatValue('mode', { kind: 'enum', options: ['Auto'] }, 'Auto')).toBe('Auto');
    expect(formatValue('mode', { kind: 'enum', options: ['Auto'] }, 5.5)).toBe('5.5');
    expect(formatValue('fan', { kind: 'number', min: 0, max: 9, step: 1 }, 'high')).toBe('high');
    expect(formatValue('color', { kind: 'color' }, { hue: 1, saturation: 2, value: 3 })).toBe(
      '{"hue":1,"saturation":2,"value":3}',
    );
    expect(formatValue('ring', { kind: 'action' }, null)).toBe('null');
  });
});

describe('summarising a device', () => {
  it('says a device is offline before anything else', () => {
    expect(deviceSummary(door)).toBe('Offline');
  });

  it('joins power with the first reading that is not an action', () => {
    expect(deviceSummary(purifier)).toBe('On · Auto');
    expect(deviceSummary({ ...conditioner, state: { target_temperature: 21 } })).toBe('21.0°C');
    expect(deviceSummary({ ...conditioner, state: { power: false, target_temperature: 21 } })).toBe(
      'Off · 21.0°C',
    );
  });

  it('says when nothing has been reported yet', () => {
    expect(deviceSummary(sensor)).toBe('No reading yet');
    expect(deviceSummary({ ...sensor, state: { leak: false } })).toBe('Dry');
  });
});

describe('number presets', () => {
  it('offers the ends and the quarters of the range, snapped to the step', () => {
    expect(numberPresets({ kind: 'number', min: 16, max: 30, step: 0.5 })).toStrictEqual([
      16, 19.5, 23, 26.5, 30,
    ]);
    expect(numberPresets({ kind: 'number', min: 1, max: 14, step: 1 })).toStrictEqual([
      1, 4, 8, 11, 14,
    ]);
  });

  it('never repeats a value or passes the maximum', () => {
    expect(numberPresets({ kind: 'number', min: 0, max: 1, step: 1 })).toStrictEqual([0, 1]);
    expect(numberPresets({ kind: 'number', min: 5, max: 5, step: 1 })).toStrictEqual([5]);
    expect(numberPresets({ kind: 'number', min: 0, max: 7, step: 2 })).toStrictEqual([0, 2, 4, 6]);
  });

  it('only ever offers values the range accepts', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -50, max: 50 }),
        fc.integer({ min: 0, max: 200 }),
        fc.constantFrom(0.1, 0.5, 1, 5),
        (min, width, step) => {
          const descriptor: ValueDescriptor = { kind: 'number', min, max: min + width, step };
          for (const value of numberPresets(descriptor)) {
            expect(accepts(descriptor, value)).toBe(true);
          }
        },
      ),
    );
  });
});

describe('whether a value is accepted', () => {
  it('answers instead of throwing for a refused value', () => {
    expect(accepts({ kind: 'boolean' }, true)).toBe(true);
    expect(accepts({ kind: 'boolean' }, 'yes')).toBe(false);
  });

  it('lets a failure that is not a refusal through', () => {
    const broken: ValueDescriptor = {
      kind: 'number',
      get min(): number {
        throw new RangeError('the range could not be read');
      },
      max: 1,
      step: 1,
    };
    expect(() => accepts(broken, 1)).toThrow('the range could not be read');
  });
});

describe('the search index', () => {
  it('lists every group', () => {
    expect(SEARCH_GROUPS).toStrictEqual([
      'action',
      'device',
      'room',
      'setting',
      'scene',
      'page',
      'automation',
    ]);
  });

  it('describes a device with its state and a quick power toggle', () => {
    expect(entry('device:purifier')).toStrictEqual({
      id: 'device:purifier',
      group: 'device',
      title: 'Air purifier',
      detail: 'Living room · air purifier',
      keywords: ['air purifier', 'Living room', 'device'],
      state: 'On · Auto',
      run: { kind: 'command', deviceId: 'purifier', capability: 'power', value: false },
      runLabel: 'Turn off',
      open: { kind: 'device', deviceId: 'purifier' },
      openLabel: 'Open',
      suggested: true,
    });
    expect(entry('device:conditioner').run).toStrictEqual({
      kind: 'command',
      deviceId: 'conditioner',
      capability: 'power',
      value: true,
    });
    expect(entry('device:conditioner').runLabel).toBe('Turn on');
    expect(entry('device:door').detail).toBe('lock');
    expect(entry('device:door').keywords).toStrictEqual(['lock', 'device']);
    expect(entry('device:door').run).toBeNull();
    expect(entry('device:door').runLabel).toBeNull();
  });

  it('gives no quick toggle when power can only be read', () => {
    const watched: SearchDevice = {
      ...conditioner,
      id: 'watched',
      capabilities: [{ ...power, access: 'read' }],
    };
    const index = buildSearchIndex({ ...sources, devices: [watched] });
    expect(index.entries.find((candidate) => candidate.id === 'device:watched')?.run).toBeNull();
  });

  it('turns every writable capability into actions named as the design names them', () => {
    const actions = buildSearchIndex(sources)
      .entries.filter((candidate) => candidate.group === 'action')
      .map((candidate) => candidate.title);
    expect(actions).toStrictEqual([
      'Turn on — Air purifier',
      'Turn off — Air purifier',
      'Mode → Auto — Air purifier',
      'Mode → Sleep — Air purifier',
      'Reset filter — Air purifier',
      'Send IR code — Air purifier',
      'Colour — Air purifier',
      'Display text — Air purifier',
      'Child lock on — Air purifier',
      'Child lock off — Air purifier',
      'Turn on — Air conditioner',
      'Turn off — Air conditioner',
      'Target 16.0°C — Air conditioner',
      'Target 19.5°C — Air conditioner',
      'Target 23.0°C — Air conditioner',
      'Target 26.5°C — Air conditioner',
      'Target 30.0°C — Air conditioner',
      'Lock — Front door',
      'Unlock — Front door',
      'Mute — Front door',
      'Unmute — Front door',
    ]);
  });

  it('runs an action as a command and opens its device', () => {
    expect(entry('action:purifier:purifier_mode:"Sleep"')).toStrictEqual({
      id: 'action:purifier:purifier_mode:"Sleep"',
      group: 'action',
      title: 'Mode → Sleep — Air purifier',
      detail: 'Living room · Air purifier',
      keywords: [
        'Air purifier',
        'air purifier',
        'Living room',
        'Mode',
        'purifier mode',
        'purifier',
        'set',
        'to',
      ],
      state: null,
      run: { kind: 'command', deviceId: 'purifier', capability: 'purifier_mode', value: 'Sleep' },
      runLabel: 'Run',
      open: { kind: 'device', deviceId: 'purifier' },
      openLabel: 'Open',
      suggested: false,
    });
    expect(entry('action:purifier:power:false').run).toStrictEqual({
      kind: 'command',
      deviceId: 'purifier',
      capability: 'power',
      value: false,
    });
    expect(entry('action:purifier:filter_reset:null').run).toStrictEqual({
      kind: 'command',
      deviceId: 'purifier',
      capability: 'filter_reset',
      value: null,
    });
    expect(entry('action:door:lock:true').detail).toBe('Front door');
    expect(entry('action:door:lock:true').keywords).toStrictEqual([
      'Front door',
      'lock',
      'Lock',
      'lock',
      'door',
      'unlock',
    ]);
  });

  it('suggests the power actions of favourite devices', () => {
    expect(entry('action:purifier:power:true').suggested).toBe(true);
    expect(entry('action:purifier:purifier_mode:"Auto"').suggested).toBe(false);
    expect(entry('action:conditioner:power:true').suggested).toBe(false);
  });

  it('opens the device for a control that needs more than one tap', () => {
    expect(entry('control:purifier:ir_send')).toStrictEqual({
      id: 'control:purifier:ir_send',
      group: 'action',
      title: 'Send IR code — Air purifier',
      detail: 'Living room · Air purifier',
      keywords: [
        'Air purifier',
        'air purifier',
        'Living room',
        'Send IR code',
        'ir send',
        'remote',
      ],
      state: null,
      run: null,
      runLabel: null,
      open: { kind: 'device', deviceId: 'purifier' },
      openLabel: 'Open',
      suggested: false,
    });
    expect(entry('control:purifier:raw:led_text').keywords).toStrictEqual([
      'Air purifier',
      'air purifier',
      'Living room',
      'Display text',
      'raw:led text',
    ]);
  });

  it('indexes rooms, pages, settings, scenes and automations', () => {
    expect(entry('room:living')).toMatchObject({
      group: 'room',
      title: 'Living room',
      detail: '2 devices',
      keywords: ['room'],
      run: null,
      runLabel: null,
      open: { kind: 'room', roomId: 'living' },
      openLabel: 'Show',
      state: null,
      suggested: false,
    });
    expect(entry('page:/climate')).toMatchObject({
      group: 'page',
      title: 'Climate',
      detail: 'Purifier, humidifier',
      keywords: ['page', 'go', 'open', 'air'],
      run: null,
      runLabel: null,
      open: { kind: 'page', path: '/climate' },
      openLabel: 'Go',
      state: null,
      suggested: false,
    });
    expect(entry('setting:accent:violet')).toMatchObject({
      group: 'setting',
      detail: 'Appearance',
      keywords: ['setting', 'theme'],
      state: 'Amber',
      run: { kind: 'setting', settingId: 'accent:violet', value: 'violet' },
      runLabel: 'Set',
      open: { kind: 'page', path: '/more' },
      openLabel: 'Open',
      suggested: false,
    });
    expect(entry('setting:members')).toMatchObject({ run: null, runLabel: null, state: null });
    expect(entry('scene:evening')).toMatchObject({
      group: 'scene',
      title: 'Evening',
      detail: 'Scene',
      keywords: ['scene', 'mode', 'run', 'activate', 'start'],
      state: null,
      run: { kind: 'scene', sceneId: 'evening' },
      runLabel: 'Run',
      open: { kind: 'page', path: '/automations' },
      openLabel: 'Edit',
      suggested: false,
    });
    expect(entry('automation:porch')).toMatchObject({
      group: 'automation',
      title: 'Porch lights at sunset',
      detail: 'Automation',
      keywords: ['automation', 'rule', 'disable', 'pause', 'stop', 'turn off'],
      state: 'Armed',
      run: { kind: 'automation', automationId: 'porch', enabled: false },
      runLabel: 'Pause',
      open: { kind: 'page', path: '/automations' },
      openLabel: 'Edit',
      suggested: false,
    });
    expect(entry('automation:cry')).toMatchObject({
      keywords: ['automation', 'rule', 'enable', 'resume', 'start', 'turn on'],
      state: 'Paused',
      run: { kind: 'automation', automationId: 'cry', enabled: true },
      runLabel: 'Enable',
    });
  });

  it('counts what it holds in each group', () => {
    expect(countByGroup(buildSearchIndex(sources))).toStrictEqual({
      action: 21,
      device: 4,
      room: 1,
      setting: 2,
      scene: 1,
      page: 7,
      automation: 2,
    });
  });

  it('keeps every writable number as a template for typed values', () => {
    const index = buildSearchIndex(sources);
    expect(
      index.numbers.map((template) => `${template.device.id}:${template.capability.key}`),
    ).toStrictEqual(['conditioner:target_temperature']);
    expect(typedNumberEntries(index, 21.5).map((typed) => typed.title)).toStrictEqual([
      'Target 21.5°C — Air conditioner',
    ]);
    expect(typedNumberEntries(index, 21.3)).toStrictEqual([]);
    expect(typedNumberEntries(index, 31)).toStrictEqual([]);
    expect(typedNumberEntries(index, null)).toStrictEqual([]);
  });
});

describe('ranking', () => {
  it('splits a query into lower-case words', () => {
    expect(tokensOf('  Purifier   SLEEP ')).toStrictEqual(['purifier', 'sleep']);
    expect(tokensOf('')).toStrictEqual([]);
  });

  it('finds the letters of a word in order', () => {
    expect(isSubsequence('ac', 'air conditioner')).toBe(true);
    expect(isSubsequence('ca', 'ac')).toBe(false);
    expect(isSubsequence('aa', 'a')).toBe(false);
  });

  it('prefers the start of the title, then a word in it, then anywhere, then the details', () => {
    expect(tokenScore('air', 'air purifier', '')).toBe(8);
    expect(tokenScore('pur', 'air purifier', '')).toBe(6);
    expect(tokenScore('ifi', 'air purifier', '')).toBe(4);
    expect(tokenScore('liv', 'air purifier', 'living room')).toBe(3);
    expect(tokenScore('oom', 'air purifier', 'living room')).toBe(2);
    expect(tokenScore('apr', 'air purifier', '')).toBe(1);
    expect(tokenScore('z', 'air purifier', '')).toBe(0);
    expect(tokenScore('a', 'b a', '')).toBe(6);
    expect(tokenScore('r', 'ab', 'x')).toBe(0);
    expect(tokenScore('ae', 'plate', '')).toBe(1);
  });

  it('splits words on the separators titles use', () => {
    for (const title of ['x·sleep', 'x—sleep', 'x→sleep', 'x,sleep', 'x/sleep', 'x(sleep)']) {
      expect(tokenScore('sleep', title, '')).toBe(6);
    }
    expect(tokenScore('sleep', 'x-sleep', '')).toBe(4);
    expect(tokenScore('liv', 'z', 'a·living')).toBe(3);
  });

  it('boosts what was used recently, halving each day', () => {
    expect(recencyBoost(undefined, DAY)).toBe(0);
    expect(recencyBoost(DAY, DAY)).toBe(RECENCY_WEIGHT);
    expect(recencyBoost(0, DAY)).toBe(RECENCY_WEIGHT / 2);
    expect(recencyBoost(0, 2 * DAY)).toBe(RECENCY_WEIGHT / 4);
    expect(recencyBoost(2 * DAY, DAY)).toBe(RECENCY_WEIGHT);
    expect(RECENCY_WEIGHT).toBe(6);
  });

  it('scores an exact title above everything and refuses an entry missing a word', () => {
    const device = entry('device:purifier');
    expect(EXACT_SCORE).toBe(100);
    expect(scoreEntry(device, ['air', 'purifier'], options)).toBe(100 + 8 + 6 + 1.5);
    expect(scoreEntry(device, ['air'], options)).toBe(8 + 1.5);
    expect(scoreEntry(device, ['air', 'zebra'], options)).toBeNull();
    expect(scoreEntry(device, ['living'], options)).toBe(3 + 1.5);
    expect(scoreEntry(device, ['device'], options)).toBe(3 + 1.5);
    expect(
      scoreEntry(device, ['air'], { ...options, recent: { 'device:purifier': options.now } }),
    ).toBe(8 + 1.5 + RECENCY_WEIGHT);
  });

  it('weighs each group', () => {
    const weights = [
      ['action:purifier:power:true', 0],
      ['room:living', 1],
      ['setting:members', 0.5],
      ['scene:evening', 1],
      ['page:/climate', 1],
      ['automation:porch', 0.5],
    ] as const;
    for (const [id, weight] of weights) {
      const found = entry(id);
      expect(scoreEntry(found, [found.title.toLowerCase()], options)).toBe(100 + 8 + weight);
    }
  });

  it('reads a number typed into the query', () => {
    expect(numberIn(['nursery', '55%'])).toBe(55);
    expect(numberIn(['21.5°c'])).toBe(21.5);
    expect(numberIn(['21°'])).toBe(21);
    expect(numberIn(['21.55'])).toBe(21.55);
    expect(numberIn(['70°f'])).toBe(70);
    expect(numberIn(['2700k'])).toBe(2700);
    expect(numberIn(['60w'])).toBe(60);
    expect(numberIn(['-4'])).toBe(-4);
    expect(numberIn(['ac', '5x'])).toBeNull();
    expect(numberIn(['x5'])).toBeNull();
    expect(numberIn(['5.'])).toBeNull();
    expect(numberIn(['.5'])).toBeNull();
    expect(numberIn(['1', '2'])).toBe(1);
  });
});

describe('searching', () => {
  it('suggests favourites and recent entries when nothing is typed, most recent first', () => {
    const recent = { 'scene:evening': options.now, 'page:/climate': options.now - DAY };
    expect(titles('', { recent })).toStrictEqual([
      'Evening',
      'Climate',
      'Air purifier',
      'Turn off — Air purifier',
      'Turn on — Air purifier',
    ]);
    expect(titles('', { recent, limit: 1 })).toStrictEqual(['Evening']);
    expect(
      titles('', {
        recent: { 'scene:evening': options.now, 'device:purifier': options.now },
      }).slice(0, 2),
    ).toStrictEqual(['Air purifier', 'Evening']);
    expect(titles('', { recent, group: 'page' })).toStrictEqual(['Climate']);
  });

  it('ranks the best match first and keeps every query word', () => {
    expect(titles('purifier sleep')).toStrictEqual(['Mode → Sleep — Air purifier']);
    expect(titles('air purifier')[0]).toBe('Air purifier');
    expect(titles('air purifier')).toContain('Climate');
  });

  it('finds an action from the words a person would say', () => {
    expect(titles('turn off bedroom ac')[0]).toBe('Turn off — Air conditioner');
    expect(titles('unlock')).toStrictEqual(['Unlock — Front door', 'Lock — Front door']);
  });

  it('runs scenes and switches automations from the words a person would say', () => {
    expect(titles('run evening scene')).toStrictEqual(['Evening']);
    expect(titles('disable porch automation')).toStrictEqual(['Porch lights at sunset']);
    expect(titles('enable porch automation')).toStrictEqual([]);
    expect(titles('enable baby cry')).toStrictEqual(['Baby cry call']);
    expect(titles('disable baby cry')).toStrictEqual([]);
  });

  it('offers a typed value when a device accepts it, once', () => {
    expect(titles('bedroom 21.5')).toStrictEqual(['Target 21.5°C — Air conditioner']);
    expect(titles('bedroom 23')).toStrictEqual(['Target 23.0°C — Air conditioner']);
    expect(titles('bedroom 99')).toStrictEqual([]);
  });

  it('filters by group and stops at the limit', () => {
    expect(titles('air', { group: 'device' })).toStrictEqual(['Air conditioner', 'Air purifier']);
    expect(titles('air', { limit: 2 })).toHaveLength(2);
  });

  it('breaks ties by title and marks where the first word matched', () => {
    const index = buildSearchIndex(sources);
    const [first, second] = searchIndex(index, 'air', { ...options, group: 'device' });
    expect(first?.highlight).toStrictEqual({ start: 0, end: 3 });
    expect(second?.score).toBe(first?.score);
    expect(searchIndex(index, 'apr', options)[0]?.highlight).toBeNull();
    expect(searchIndex(index, 'zzz air', options)).toStrictEqual([]);
    expect(searchIndex(index, 'living purifier', options)[0]?.highlight).toStrictEqual({
      start: 4,
      end: 12,
    });
    expect(searchIndex(index, 'sleep', options)[0]?.highlight).toStrictEqual({ start: 7, end: 12 });
  });

  it('only ever returns entries holding every word, best first', () => {
    const index = buildSearchIndex(sources);
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z ]{0,12}$/), (query) => {
        const results = searchIndex(index, query, options);
        for (const [position, result] of results.entries()) {
          const next = results[position + 1];
          if (next !== undefined) {
            expect(result.score).toBeGreaterThanOrEqual(next.score);
          }
        }
      }),
    );
  });
});
