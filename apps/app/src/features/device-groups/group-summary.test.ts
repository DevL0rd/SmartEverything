import { describe, expect, it } from 'vitest';
import type { HsvColor, TargetState } from '@smarteverything/domain';
import {
  bandLabel,
  bandScope,
  colourNames,
  colourNote,
  groupSummary,
  orderMembers,
  pageSummary,
  powerTurnsOn,
  spreadText,
  whiteScope,
} from './group-summary';

function state(overrides: Partial<TargetState>): TargetState {
  return {
    members: 6,
    online: 6,
    on: 6,
    power: 'on',
    level: null,
    whiteTemperature: null,
    colours: [],
    support: {},
    ...overrides,
  };
}

function spread(values: readonly number[]): NonNullable<TargetState['level']> {
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    mean: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
    perMember: values.map((value, index) => ({ deviceId: `d${String(index)}`, value })),
  };
}

describe('groupSummary', () => {
  it('shows the level when every light is on at the same level', () => {
    expect(groupSummary(state({ level: spread([60, 60]) }))).toEqual({
      text: 'All on · 60 %',
      tone: 'primary',
    });
  });

  it('shows the level range when lit lights differ', () => {
    expect(groupSummary(state({ level: spread([40, 80]) })).text).toBe('All on · 40–80 %');
  });

  it('counts lit lights when only some are on', () => {
    expect(groupSummary(state({ power: 'mixed', on: 4 }))).toEqual({
      text: '4 of 6 on',
      tone: 'primary',
    });
  });

  it('says All off in the quiet tone', () => {
    expect(groupSummary(state({ power: 'off', on: 0 }))).toEqual({
      text: 'All off',
      tone: 'variant',
    });
  });

  it('says All offline when no member can be reached', () => {
    expect(groupSummary(state({ power: 'none', online: 0, on: 0 }))).toEqual({
      text: 'All offline',
      tone: 'variant',
    });
  });

  it('appends the offline count only when some members are offline', () => {
    expect(groupSummary(state({ power: 'mixed', on: 3, online: 5 })).text).toBe(
      '3 of 6 on · 1 offline',
    );
    expect(groupSummary(state({ power: 'off', on: 0, online: 4 })).text).toBe(
      'All off · 2 offline',
    );
  });
});

describe('spreadText', () => {
  it('reads Off without a spread, one value when equal and a range otherwise', () => {
    expect(spreadText(null, ' %')).toBe('Off');
    expect(spreadText(spread([3000, 3000]), ' K')).toBe('3000 K');
    expect(spreadText(spread([2700, 4000]), ' K')).toBe('2700–4000 K');
  });
});

describe('orderMembers', () => {
  it('keeps the given order, moves offline members last and is stable', () => {
    const members = [
      { id: 'a', online: false },
      { id: 'b', online: true },
      { id: 'c', online: false },
      { id: 'd', online: true },
    ];
    expect(orderMembers(members).map((member) => member.id)).toEqual(['b', 'd', 'a', 'c']);
    expect(orderMembers(orderMembers(members))).toEqual(orderMembers(members));
  });
});

describe('powerTurnsOn', () => {
  it('turns everything off when any light is on and everything on when none is', () => {
    expect(powerTurnsOn(state({ power: 'mixed', on: 2 }))).toBe(false);
    expect(powerTurnsOn(state({ power: 'on' }))).toBe(false);
    expect(powerTurnsOn(state({ power: 'off', on: 0 }))).toBe(true);
  });
});

describe('colourNote', () => {
  it('names partial colour support and stays silent when it is complete or absent', () => {
    expect(colourNote(state({ support: { color: 4 } }), 'light')).toBe('Colour: 4 of 6 lights');
    expect(colourNote(state({ support: { color: 6 } }), 'light')).toBeNull();
    expect(colourNote(state({ support: {} }), 'light')).toBeNull();
  });

  it('names devices when the group is not only lights', () => {
    expect(colourNote(state({ support: { color: 1 } }), 'device')).toBe('Colour: 1 of 6 devices');
  });
});

describe('master band words', () => {
  it('names the whole group when every member can dim and the share when only some can', () => {
    expect(bandLabel(state({ support: { brightness: 6 } }), 'light')).toBe('All lights');
    expect(bandLabel(state({ support: { brightness: 6 } }), 'device')).toBe('All devices');
    expect(bandLabel(state({ support: { brightness: 2 } }), 'device')).toBe('Brightness · 2 of 6');
  });

  it('says in the spoken label how many of the members the control drives', () => {
    expect(bandScope(state({ support: { brightness: 6 } }), 'light')).toBe('all lights');
    expect(bandScope(state({ support: { brightness: 2 } }), 'device')).toBe('2 of 6 devices');
    expect(whiteScope(state({ support: { color_temperature: 3 } }), 'light')).toBe('3 of 6 lights');
    expect(whiteScope(state({ support: { color_temperature: 6 } }), 'light')).toBe('all lights');
  });
});

describe('colourNames', () => {
  const colour = (hue: number, saturation: number): HsvColor => ({ hue, saturation, value: 100 });

  it('names distinct hues and calls low saturation white', () => {
    expect(colourNames([colour(32, 80), colour(0, 5), colour(220, 70)])).toBe('amber, white, blue');
  });

  it('counts the colours beyond the first three', () => {
    expect(
      colourNames([
        colour(0, 90),
        colour(30, 90),
        colour(100, 90),
        colour(220, 90),
        colour(280, 90),
      ]),
    ).toBe('red, amber, green, and 2 more');
  });

  it('wraps hues near 360 back to red', () => {
    expect(colourNames([colour(355, 90)])).toBe('red');
  });
});

describe('pageSummary', () => {
  it('counts the members, those on and those offline', () => {
    expect(pageSummary(state({ on: 4, power: 'mixed', online: 5 }), 'light')).toBe(
      '6 lights · 4 on · 1 offline',
    );
    expect(pageSummary(state({ on: 6 }), 'device')).toBe('6 devices · 6 on');
  });

  it('says all offline when nothing can be reached and No devices when empty', () => {
    expect(pageSummary(state({ power: 'none', online: 0, on: 0 }), 'light')).toBe(
      '6 lights · all offline',
    );
    expect(pageSummary(state({ members: 0, online: 0, on: 0, power: 'none' }), 'light')).toBe(
      'No devices',
    );
  });
});
