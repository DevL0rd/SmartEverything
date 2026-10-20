import { describe, expect, it } from 'vitest';
import {
  MAX_BREAKPOINTS_PER_AUTOMATION,
  MAX_FAVOURITE_KINDS,
  MAX_RECENT_KINDS,
} from '@smarteverything/domain';
import {
  breakpointsOf,
  withBreakpointToggled,
  withBreakpoints,
  withFavouriteToggled,
  withRecentKind,
} from './prefs-edit';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const N1 = '00000000-0000-4000-8000-0000000000a1';
const N2 = '00000000-0000-4000-8000-0000000000a2';

describe('palette preference', () => {
  it('puts the newest kind first, drops a repeat and caps the list', () => {
    const first = withRecentKind(
      { recents: ['flow.if', 'flow.wait'], favourites: [] },
      'flow.wait',
    );
    expect(first.recents).toEqual(['flow.wait', 'flow.if']);
    const many = Array.from({ length: MAX_RECENT_KINDS }, (_, index) => `flow.k${String(index)}`);
    const capped = withRecentKind({ recents: many, favourites: [] }, 'flow.new');
    expect(capped.recents).toHaveLength(MAX_RECENT_KINDS);
    expect(capped.recents[0]).toBe('flow.new');
  });

  it('toggles a favourite and refuses to go past the cap', () => {
    const added = withFavouriteToggled({ recents: [], favourites: [] }, 'flow.if');
    expect(added?.favourites).toEqual(['flow.if']);
    expect(withFavouriteToggled(added!, 'flow.if')?.favourites).toEqual([]);
    const full = {
      recents: [],
      favourites: Array.from(
        { length: MAX_FAVOURITE_KINDS },
        (_, index) => `flow.k${String(index)}`,
      ),
    };
    expect(withFavouriteToggled(full, 'flow.extra')).toBeNull();
    expect(withFavouriteToggled(full, 'flow.k0')?.favourites).toHaveLength(MAX_FAVOURITE_KINDS - 1);
  });
});

describe('breakpoints preference', () => {
  it('toggles a step on and off and drops the automation when none are left', () => {
    const on = withBreakpointToggled({ byAutomation: {} }, A, N1);
    expect(breakpointsOf(on!, A)).toEqual([N1]);
    const two = withBreakpointToggled(on!, A, N2);
    expect(breakpointsOf(two!, A)).toEqual([N1, N2]);
    const off = withBreakpointToggled(withBreakpointToggled(two!, A, N1)!, A, N2);
    expect(off).toEqual({ byAutomation: {} });
  });

  it('keeps other automations untouched and removes duplicates', () => {
    const start = { byAutomation: { [B]: [N1] } };
    const next = withBreakpoints(start, A, [N1, N1, N2]);
    expect(next?.byAutomation[B]).toEqual([N1]);
    expect(next?.byAutomation[A]).toEqual([N1, N2]);
  });

  it('refuses more steps than one automation may keep', () => {
    const ids = Array.from(
      { length: MAX_BREAKPOINTS_PER_AUTOMATION + 1 },
      (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    );
    expect(withBreakpoints({ byAutomation: {} }, A, ids)).toBeNull();
  });
});
