import { describe, expect, it } from 'vitest';
import { CAPABILITY_CATALOGUE } from '../../src/capabilities';
import type { NodeKind } from '../../src/automation-nodes/define';
import { buildRegistry, kindProblems, nodeCatalogue } from '../../src/automation-nodes/registry';
import {
  DEVICE_NODE_KINDS,
  NON_DURABLE_SCOPES,
  readsControl,
} from '../../src/automation-nodes/devices';
import {
  READ_ONLY_GROUPS,
  devicePresetsFrom,
  deviceSetPresets,
  isSettable,
} from '../../src/automation-nodes/presets';
import {
  AGGREGATE_FUNCTIONS,
  HISTORY_RANGES,
  STATE_NODE_KINDS,
} from '../../src/automation-nodes/state';
import { HOME_STRUCTURE_NODE_KINDS, PEOPLE_NODE_KINDS } from '../../src/automation-nodes/people';
import { WEATHER_NODE_KINDS } from '../../src/automation-nodes/weather';

const ALL = [
  ...DEVICE_NODE_KINDS,
  ...STATE_NODE_KINDS,
  ...PEOPLE_NODE_KINDS,
  ...HOME_STRUCTURE_NODE_KINDS,
  ...WEATHER_NODE_KINDS,
];

function kind(id: string): NodeKind {
  const found = ALL.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no kind ${id}`);
  return found;
}

describe('home kinds', () => {
  it('define the catalogue ids and pass the registry rules', () => {
    expect(ALL.map((entry) => entry.id).sort()).toEqual(
      [
        'device.get',
        'device.set',
        'device.set_temporarily',
        'device.toggle',
        'device.query',
        'device.aggregate',
        'device.health',
        'device.operation',
        'room.info',
        'group.members',
        'scene.run',
        'timing.cooldown',
        'timing.hysteresis',
        'state.history',
        'presence.person',
        'presence.who_home',
        'weather.read',
      ].sort(),
    );
    for (const entry of ALL) expect(kindProblems(entry)).toEqual([]);
    const registry = buildRegistry(ALL);
    expect(registry.shipped()).toHaveLength(ALL.length);
  });

  it('shows in the catalogue by group', () => {
    const registry = buildRegistry(ALL);
    expect(nodeCatalogue(registry, { group: 'devices' })).toHaveLength(11);
    expect(nodeCatalogue(registry, { group: 'state' }).map((entry) => entry.id)).toEqual([
      'state.history',
      'timing.cooldown',
      'timing.hysteresis',
    ]);
    expect(nodeCatalogue(registry, { query: 'raining' }).map((entry) => entry.id)).toEqual([
      'weather.read',
    ]);
  });
});

describe('device kinds', () => {
  it('classes effects per the effect table', () => {
    expect(kind('device.get').class).toBe('read');
    expect(kind('device.set').effect).toEqual({ retry: 'relative', budget: 'command' });
    expect(kind('device.toggle').effect).toEqual({ retry: 'relative', budget: 'command' });
    expect(kind('device.set_temporarily').effect).toEqual({
      retry: 'idempotent',
      budget: 'command',
    });
    expect(kind('device.operation').effect).toEqual({ retry: 'external', budget: 'effects' });
    expect(kind('scene.run').effect).toEqual({ retry: 'idempotent', budget: 'command' });
  });

  it('gives set_temporarily a body region that is never checkpointed', () => {
    const temporary = kind('device.set_temporarily');
    expect(temporary.scopes?.required).toEqual(['body']);
    expect(temporary.exits).toEqual(['next', 'ended']);
    expect(NON_DURABLE_SCOPES[temporary.id]).toEqual(['body']);
    expect(temporary.inputs.find((port) => port.name === 'priority')?.type).toMatchObject({
      min: -1000,
      max: 1000,
    });
  });

  it('keeps the partial-failure outputs on set', () => {
    const outputs = kind('device.set').outputs.map((port) => port.name);
    expect(outputs).toEqual(['ok', 'sent', 'skipped', 'value', 'error']);
    expect(kind('device.set').inputs.find((port) => port.name === 'requireAll')?.default).toBe(
      false,
    );
  });

  it('reads dependency keys from the control', () => {
    const reads = kind('device.get').reads;
    expect(reads?.({ control: { lit: 'brightness' } })).toEqual(['device:brightness']);
    expect(reads?.({ control: { wire: { from: 'x', port: 'control' } } })).toEqual(['device']);
    expect(reads?.({})).toEqual(['device']);
    expect(readsControl({ control: { lit: 4 } })).toEqual(['device']);
    expect(kind('device.aggregate').reads?.({ control: { lit: 'power' } })).toEqual([
      'device:power',
    ]);
    expect(kind('device.query').reads?.({})).toEqual(['device']);
    expect(kind('device.health').reads?.({})).toEqual(['device:status']);
    expect(kind('room.info').reads?.({})).toEqual(['device']);
    expect(kind('group.members').reads?.({})).toEqual(['group']);
  });

  it('offers every aggregate function once', () => {
    const fn = kind('device.aggregate').inputs.find((port) => port.name === 'fn');
    expect(fn?.type).toMatchObject({ t: 'choice' });
    expect(new Set(AGGREGATE_FUNCTIONS.map((entry) => entry.id)).size).toBe(
      AGGREGATE_FUNCTIONS.length,
    );
  });
});

describe('device.set presets', () => {
  it('come from the capability catalogue with no hand list', () => {
    const presets = deviceSetPresets();
    const expected = Object.entries(CAPABILITY_CATALOGUE).filter(([, entry]) => isSettable(entry));
    expect(presets).toHaveLength(expected.length);
    expect(new Set(presets.map((preset) => preset.id)).size).toBe(presets.length);
    for (const preset of presets) {
      expect(preset.id).toBe(`device.set.${preset.capability}`);
      expect(preset.inputs.control).toBe(preset.capability);
      expect(READ_ONLY_GROUPS).not.toContain(preset.group);
    }
  });

  it('marks action capabilities relative and values absolute', () => {
    const presets = deviceSetPresets();
    const power = presets.find((preset) => preset.capability === 'power');
    expect(power).toMatchObject({ name: 'Power', valueKind: 'boolean', relative: false });
    const doorbell = presets.find((preset) => preset.capability === 'doorbell');
    expect(doorbell?.relative).toBe(true);
  });

  it('skips sampled and read-only groups and follows a new catalogue entry', () => {
    const presets = devicePresetsFrom({
      lamp: { label: 'Lamp', group: 'lighting', kind: 'boolean', keywords: ['x'] },
      meter: { label: 'Meter', group: 'sensor', kind: 'number', keywords: [] },
      sampled: { label: 'Sampled', group: 'lighting', kind: 'number', keywords: [], sampled: true },
      unknown: { label: 'Unknown', group: 'lighting', kind: 'number', keywords: [] },
    });
    expect(presets).toEqual([]);
    const real = devicePresetsFrom({
      power: { label: 'Power', group: 'power', kind: 'boolean', keywords: [] },
    });
    expect(real.map((preset) => preset.id)).toEqual(['device.set.power']);
  });
});

describe('state kinds', () => {
  it('cooldown passes or blocks and is remembered', () => {
    const cooldown = kind('timing.cooldown');
    expect(cooldown.exits).toEqual(['pass', 'blocked']);
    expect(cooldown.stateful).toBe(true);
    expect(cooldown.outputs.map((port) => port.name)).toEqual(['remaining']);
    expect(cooldown.inputs.find((port) => port.name === 'period')?.required).toBe(true);
  });

  it('hysteresis has two thresholds and three flag outputs', () => {
    const hysteresis = kind('timing.hysteresis');
    expect(hysteresis.stateful).toBe(true);
    expect(hysteresis.outputs.map((port) => port.name)).toEqual(['state', 'rose', 'fell']);
    expect(hysteresis.inputs.map((port) => port.name)).toEqual(['value', 'high', 'low', 'initial']);
  });

  it('history reads points and statistics', () => {
    const history = kind('state.history');
    expect(history.class).toBe('read');
    expect(history.outputs.map((port) => port.name)).toEqual([
      'points',
      'average',
      'min',
      'max',
      'change',
      'count',
      'timeIn',
    ]);
    expect(history.reads?.({})).toEqual(['device:history']);
    expect(HISTORY_RANGES.map((range) => range.id)).toEqual(['last', 'between']);
  });
});

describe('people and weather kinds', () => {
  it('reads presence', () => {
    expect(kind('presence.person').outputs.map((port) => port.name)).toEqual([
      'isHome',
      'place',
      'since',
    ]);
    expect(kind('presence.who_home').outputs.map((port) => port.name)).toEqual([
      'people',
      'count',
      'anyone',
    ]);
    expect(kind('presence.person').reads?.({})).toEqual(['presence']);
    expect(kind('presence.who_home').reads?.({})).toEqual(['presence']);
  });

  it('reads weather metrics and an enum kind', () => {
    const weather = kind('weather.read');
    expect(weather.outputs.map((port) => port.name)).toEqual([
      'temperature',
      'feelsLike',
      'humidity',
      'windSpeed',
      'precipitation',
      'rainChance',
      'aqi',
      'pm25',
      'uvIndex',
      'kind',
    ]);
    const type = weather.outputs.find((port) => port.name === 'kind')?.type;
    expect(type).toMatchObject({ t: 'choice' });
    expect(type?.t === 'choice' ? type.options.length : 0).toBeGreaterThan(3);
    expect(weather.outputs.find((port) => port.name === 'aqi')?.type).toEqual({
      t: 'number',
      min: 0,
      max: 500,
    });
    expect(weather.reads?.({})).toEqual(['weather']);
  });
});
