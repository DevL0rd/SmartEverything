import { describe, expect, it } from 'vitest';
import type { TargetState } from '@smarteverything/domain';
import {
  bulbCaption,
  bulbLabel,
  BULB_WIDTH,
  haloOf,
  stageChips,
  stageLabel,
  stageMembers,
  washColour,
} from './stage';

const STATE: TargetState = {
  members: 3,
  online: 2,
  on: 2,
  power: 'mixed',
  level: {
    min: 40,
    max: 80,
    mean: 60,
    perMember: [
      { deviceId: 'a', value: 40 },
      { deviceId: 'b', value: 80 },
    ],
  },
  whiteTemperature: null,
  colours: [],
  support: {},
};

const SOURCES = [
  { id: 'a', label: 'Hall', light: true },
  { id: 'b', label: 'Desk', light: true },
  { id: 'c', label: 'Porch', light: true },
];

describe('stageMembers', () => {
  it('joins level, colour, power and mark per member in the given order', () => {
    const members = stageMembers(
      SOURCES,
      { powers: { a: 'on', b: 'on', c: 'offline' }, colours: { a: '#ff0000' }, state: STATE },
      new Map([['b', 'failed' as const]]),
    );
    expect(
      members.map((member) => [member.id, member.level, member.colour, member.mark]),
    ).toStrictEqual([
      ['a', 40, '#ff0000', null],
      ['b', 80, null, 'failed'],
      ['c', null, null, null],
    ]);
  });
});

describe('haloOf', () => {
  it('grows and brightens with the level and is larger with a pointer', () => {
    expect(haloOf(100, false).size).toBeGreaterThan(haloOf(10, false).size);
    expect(haloOf(100, false).opacity).toBeCloseTo(0.9);
    expect(haloOf(100, true).size).toBeGreaterThan(haloOf(100, false).size);
    expect(haloOf(null, false)).toStrictEqual(haloOf(60, false));
  });
});

describe('bulb words', () => {
  const base = { id: 'a', name: 'Hall', light: true, colour: null, mark: null } as const;

  it('describes every state for a screen reader', () => {
    expect(bulbLabel({ ...base, power: 'on', level: 60 })).toBe('Hall, on, 60 percent, show');
    expect(bulbLabel({ ...base, power: 'on', level: null })).toBe('Hall, on, show');
    expect(bulbLabel({ ...base, power: 'off', level: null })).toBe('Hall, off, show');
    expect(bulbLabel({ ...base, power: 'offline', level: null })).toBe('Hall, offline, show');
    expect(bulbLabel({ ...base, power: 'on', level: 60, mark: 'failed' })).toBe(
      'Hall, did not respond, show',
    );
    expect(bulbLabel({ ...base, power: 'on', level: 60, mark: 'pending' })).toBe(
      'Hall, waiting for the light, show',
    );
  });

  it('captions the state under the bulb', () => {
    expect(bulbCaption({ ...base, power: 'on', level: 60 })).toBe('60 %');
    expect(bulbCaption({ ...base, power: 'on', level: null })).toBe('On');
    expect(bulbCaption({ ...base, power: 'off', level: null })).toBe('Off');
    expect(bulbCaption({ ...base, power: 'offline', level: null })).toBe('Offline');
  });

  it('labels the whole stage with the count and the level spread', () => {
    expect(stageLabel('Downstairs', STATE, 'light')).toBe(
      'Downstairs: 2 of 3 lights on, levels 40–80 %',
    );
  });
});

describe('stageChips', () => {
  it('shows the level spread and the shared colour, mixed colours or white temperature', () => {
    expect(
      stageChips({ ...STATE, colours: [{ hue: 32, saturation: 90, value: 100 }] }),
    ).toStrictEqual(['40–80 %', 'Amber']);
    expect(
      stageChips({
        ...STATE,
        colours: [
          { hue: 32, saturation: 90, value: 100 },
          { hue: 220, saturation: 90, value: 100 },
        ],
      }),
    ).toStrictEqual(['40–80 %', 'Mixed colours']);
    expect(
      stageChips({
        ...STATE,
        whiteTemperature: { min: 2700, max: 4000, mean: 3300, perMember: [] },
      }),
    ).toStrictEqual(['40–80 %', '2700–4000 K']);
  });

  it('shows nothing when everything is off and only the level without colour data', () => {
    expect(stageChips({ ...STATE, on: 0, power: 'off' })).toStrictEqual([]);
    expect(stageChips(STATE)).toStrictEqual(['40–80 %']);
  });
});

describe('washColour', () => {
  const levels = (values: Readonly<Record<string, number>>): Pick<TargetState, 'level'> => ({
    level: {
      min: 0,
      max: 100,
      mean: 50,
      perMember: Object.entries(values).map(([deviceId, value]) => ({ deviceId, value })),
    },
  });

  it('is nothing when no lit light has a colour', () => {
    expect(washColour({}, levels({}))).toBeNull();
  });

  it('does not tint the stage for a light that is barely lit', () => {
    expect(washColour({ a: '#ff0000' }, levels({ a: 1 }))).toBeNull();
  });

  it('is the colour of a single bright light', () => {
    expect(washColour({ a: '#ff0000' }, levels({ a: 80 }))).toBe('#ff0000');
  });

  it('mixes the lit colours by how bright each light is and ignores the dim ones', () => {
    expect(washColour({ a: '#ff0000', b: '#0000ff' }, levels({ a: 100, b: 100 }))).toBe('#800080');
    expect(washColour({ a: '#ff0000', b: '#0000ff' }, levels({ a: 100, b: 5 }))).toBe('#ff0000');
    const heavy = washColour({ a: '#ff0000', b: '#0000ff' }, levels({ a: 75, b: 25 }));
    expect(heavy).toBe('#bf0040');
  });
});

describe('stage geometry', () => {
  it('fits six bulbs in the pointer column of the group page', () => {
    const COLUMN = 576 - 2 * 12 - 2;
    expect(BULB_WIDTH.pointer * 6).toBeLessThanOrEqual(COLUMN);
  });
});
