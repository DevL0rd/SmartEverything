import { describe, expect, it } from 'vitest';
import type { TargetState } from '@smarteverything/domain';
import { bandButtons, bandButtonsWidth, colourShown, moreFreed } from './band-width';

function state(support: TargetState['support']): TargetState {
  return {
    members: 4,
    online: 4,
    on: 2,
    power: 'mixed',
    level: null,
    whiteTemperature: null,
    colours: [],
    support,
  };
}

describe('group action band', () => {
  it('shows the colour button only for lights that take colour or white temperature', () => {
    expect(colourShown(state({}))).toBe(false);
    expect(colourShown(state({ color: 1 }))).toBe(true);
    expect(colourShown(state({ color_temperature: 2 }))).toBe(true);
    expect(bandButtons(true, state({ color: 1 }))).toBe(2);
    expect(bandButtons(true, state({}))).toBe(1);
    expect(bandButtons(false, state({ color: 1 }))).toBe(1);
  });

  it('reserves each control-height button and the gap before it', () => {
    expect(bandButtonsWidth(1, 48)).toBe(56);
    expect(bandButtonsWidth(2, 36)).toBe(88);
  });

  it('gives the slot of the more chip back to a member once the more button sits in the band', () => {
    expect(moreFreed({ shown: 5, hidden: 3 })).toEqual({ shown: 6, hidden: 2 });
    expect(moreFreed({ shown: 5, hidden: 1 })).toEqual({ shown: 6, hidden: 0 });
    expect(moreFreed({ shown: 4, hidden: 0 })).toEqual({ shown: 4, hidden: 0 });
  });
});
