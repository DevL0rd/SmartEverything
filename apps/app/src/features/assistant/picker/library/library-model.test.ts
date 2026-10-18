import { describe, expect, it } from 'vitest';
import {
  activeCount,
  dialogWidth,
  libraryLayout,
  librarySubtitle,
  libraryTitle,
  marksOf,
  primaryAction,
  scrollTarget,
  SORT_OPTIONS,
  toggled,
} from './library-model';
import { EMPTY_MODEL_FILTERS } from '../model-search-filters';

describe('primaryAction', () => {
  const pickable = { pick: (): void => undefined };

  it('says Use in this chat in pick mode and runs the row pick', () => {
    expect(primaryAction('pick', pickable)).toEqual({
      label: 'Use in this chat',
      run: pickable.pick,
    });
  });

  it('says Set as default in default mode', () => {
    expect(primaryAction('default', pickable)?.label).toBe('Set as default');
  });

  it('has no primary action while browsing', () => {
    expect(primaryAction('browse', pickable)).toBeNull();
  });

  it('is disabled when the row cannot be picked or nothing is selected', () => {
    expect(primaryAction('pick', { pick: null })?.run).toBeNull();
    expect(primaryAction('default', null)?.run).toBeNull();
  });
});

describe('marksOf', () => {
  it('badges only the selected row in default mode', () => {
    expect(marksOf('default', true, false)).toEqual({
      badge: true,
      check: false,
      latestCaption: false,
    });
    expect(marksOf('default', false, true)).toEqual({
      badge: false,
      check: false,
      latestCaption: false,
    });
  });

  it('keeps the check and adds the caption for a selected latest row in pick mode', () => {
    expect(marksOf('pick', true, true)).toEqual({ badge: false, check: true, latestCaption: true });
  });

  it('captions an unselected latest row and checks a selected plain row when browsing', () => {
    expect(marksOf('browse', false, true)).toEqual({
      badge: false,
      check: false,
      latestCaption: true,
    });
    expect(marksOf('browse', true, false)).toEqual({
      badge: false,
      check: true,
      latestCaption: false,
    });
  });
});

describe('mode copy', () => {
  it('titles each mode', () => {
    expect(libraryTitle('pick')).toBe('Model library');
    expect(libraryTitle('default')).toBe('Default for new chats');
    expect(libraryTitle('browse')).toBe('Model library');
    expect(librarySubtitle('default')).toBe('Used when you start a chat');
    expect(librarySubtitle('pick')).toBeNull();
  });
});

describe('libraryLayout', () => {
  it('shows filters, results and detail from 900', () => {
    expect(libraryLayout(960, false)).toBe('three');
    expect(libraryLayout(900, false)).toBe('three');
  });

  it('pushes the detail below 900 and folds filters below 760', () => {
    expect(libraryLayout(899, false)).toBe('two');
    expect(libraryLayout(760, false)).toBe('two');
    expect(libraryLayout(759, false)).toBe('one');
  });

  it('is one column on touch whatever the width', () => {
    expect(libraryLayout(1200, true)).toBe('one');
  });
});

describe('dialogWidth', () => {
  it('is the window minus 48 up to 960', () => {
    expect(dialogWidth(1920)).toBe(960);
    expect(dialogWidth(840)).toBe(792);
  });
});

describe('scrollTarget', () => {
  it('scrolls up to a row above the viewport', () => {
    expect(scrollTarget(2, 72, 400, 300)).toBe(144);
  });

  it('scrolls down just enough to show a row below the viewport', () => {
    expect(scrollTarget(10, 72, 0, 300)).toBe(492);
  });

  it('does not move for a visible row', () => {
    expect(scrollTarget(2, 72, 100, 300)).toBeNull();
  });
});

describe('filter state helpers', () => {
  it('toggles a source in and out without mutating', () => {
    const none: ReadonlySet<string> = new Set();
    const one = toggled(none, 'server');
    expect([...one]).toEqual(['server']);
    expect(none.size).toBe(0);
    expect(toggled(one, 'server').size).toBe(0);
  });

  it('counts sources and other filters together', () => {
    expect(activeCount(EMPTY_MODEL_FILTERS, new Set())).toBe(0);
    expect(
      activeCount(
        { ...EMPTY_MODEL_FILTERS, provider: 'openai', context: '128000' },
        new Set(['a']),
      ),
    ).toBe(3);
  });

  it('offers every sort the hub supports with a readable label', () => {
    expect(SORT_OPTIONS.map((option) => option.label)).toEqual([
      'Newest',
      'Name A–Z',
      'Intelligence',
      'Lowest latency',
      'Lowest input cost',
      'Lowest output cost',
      'Largest context',
    ]);
  });
});
