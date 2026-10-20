import { describe, expect, it } from 'vitest';
import {
  BOARD_LAYOUT,
  BOARD_LAYOUT_VERSION,
  arrangementOf,
  arrangementSourceOf,
  withArrangementFor,
  withCopiedArrangement,
  withDefaultArrangement,
  withFollowing,
  withUndone,
  withWidgetOverlaid,
  withoutArrangementFor,
  type BoardDefaultWidgets,
  type BoardLayout,
} from '../src';

const DEFAULTS: BoardDefaultWidgets = {
  compact: [{ key: 'dc', type: 'glance', size: 'W' }],
  medium: [{ key: 'dm', type: 'glance', size: 'M' }],
  expanded: [{ key: 'de', type: 'glance', size: 'W' }],
};

const OWN = { widgets: [{ key: 'steps', type: 'steps', size: 'M' as const }] };

const LAYOUT: BoardLayout = { version: BOARD_LAYOUT_VERSION, classes: { compact: OWN } };

describe('arrangement lookup', () => {
  it('uses the own arrangement, then the followed one, then the default', () => {
    expect(arrangementOf(LAYOUT, 'compact', DEFAULTS)).toBe(OWN.widgets);
    expect(arrangementOf(LAYOUT, 'medium', DEFAULTS)).toBe(DEFAULTS.medium);
    expect(arrangementOf(null, 'expanded', DEFAULTS)).toBe(DEFAULTS.expanded);
    const following = withFollowing(LAYOUT, 'medium', 'compact');
    expect(arrangementOf(following, 'medium', DEFAULTS)).toBe(OWN.widgets);
    expect(arrangementSourceOf(following, 'medium')).toBe('following');
    expect(arrangementSourceOf(following, 'compact')).toBe('own');
    expect(arrangementSourceOf(following, 'expanded')).toBe('default');
  });

  it('follows the default of the followed size when it was never customised, one hop only', () => {
    const chain = withFollowing(withFollowing(LAYOUT, 'expanded', 'medium'), 'medium', 'compact');
    expect(arrangementOf(chain, 'expanded', DEFAULTS)).toBe(DEFAULTS.medium);
  });
});

describe('follow', () => {
  it('is refused for a customised size and for following itself', () => {
    expect(withFollowing(LAYOUT, 'compact', 'medium')).toBe(LAYOUT);
    expect(withFollowing(LAYOUT, 'medium', 'medium')).toBe(LAYOUT);
  });

  it('is cleared by choosing none, and by customising the size', () => {
    const following = withFollowing(LAYOUT, 'medium', 'compact');
    expect(withFollowing(following, 'medium', null).follow).toBeUndefined();
    const edited = withArrangementFor(following, 'medium', { widgets: [] });
    expect(edited.follow).toBeUndefined();
    expect(BOARD_LAYOUT.safeParse(following).success).toBe(true);
  });

  it('survives editing another size and an editor reset', () => {
    const following = withFollowing(LAYOUT, 'medium', 'compact');
    expect(withArrangementFor(following, 'expanded', { widgets: [] }).follow).toStrictEqual({
      medium: 'compact',
    });
    expect(withoutArrangementFor(following, 'compact').follow).toStrictEqual({ medium: 'compact' });
  });

  it('rejects a stored layout where a size follows itself', () => {
    const bad = { ...LAYOUT, follow: { medium: 'medium' } };
    expect(BOARD_LAYOUT.safeParse(bad).success).toBe(false);
  });
});

describe('copy, reset and undo', () => {
  it('copies the resolved arrangement, keeps the previous layout and undoes once', () => {
    const copied = withCopiedArrangement(LAYOUT, 'compact', 'medium', DEFAULTS);
    expect(copied.classes.medium).toStrictEqual(OWN);
    expect(copied.previous).toStrictEqual({ classes: LAYOUT.classes });
    expect(BOARD_LAYOUT.safeParse(copied).success).toBe(true);
    const undone = withUndone(copied);
    expect(undone).toStrictEqual(LAYOUT);
    expect(withUndone(undone)).toBe(undone);
  });

  it('copies the default of a size that was never customised', () => {
    const copied = withCopiedArrangement(LAYOUT, 'expanded', 'compact', DEFAULTS);
    expect(copied.classes.compact?.widgets).toStrictEqual(DEFAULTS.expanded);
  });

  it('copying onto a following size stops following and undo brings it back', () => {
    const following = withFollowing(LAYOUT, 'medium', 'compact');
    const copied = withCopiedArrangement(following, 'expanded', 'medium', DEFAULTS);
    expect(copied.follow).toBeUndefined();
    expect(withUndone(copied)).toStrictEqual(following);
  });

  it('resets one size to the default, keeps the others and undoes once', () => {
    const both = withArrangementFor(LAYOUT, 'medium', { widgets: [] });
    const reset = withDefaultArrangement(both, 'compact');
    expect(reset.classes.compact).toBeUndefined();
    expect(reset.classes.medium).toStrictEqual({ widgets: [] });
    expect(withUndone(reset)).toStrictEqual(both);
  });

  it('forgets the undo once the board is edited normally', () => {
    const reset = withDefaultArrangement(LAYOUT, 'compact');
    expect(withArrangementFor(reset, 'medium', { widgets: [] }).previous).toBeUndefined();
  });
});

describe('widget overlay', () => {
  const extra = { key: 'extra', type: 'steps', size: 'M' as const };
  const empty: BoardLayout = { version: BOARD_LAYOUT_VERSION, classes: {} };

  it('shows an overlaid widget after the defaults and only on its own size', () => {
    const layout = withWidgetOverlaid(empty, 'medium', extra);
    expect(arrangementOf(layout, 'medium', DEFAULTS)).toStrictEqual([...DEFAULTS.medium, extra]);
    expect(arrangementOf(layout, 'compact', DEFAULTS)).toBe(DEFAULTS.compact);
    expect(arrangementSourceOf(layout, 'medium')).toBe('default');
    expect(BOARD_LAYOUT.safeParse(layout).success).toBe(true);
  });

  it('appends to an own arrangement and drops the overlay once the size is arranged or reset', () => {
    const own = withWidgetOverlaid(LAYOUT, 'compact', extra);
    expect(own.classes.compact?.widgets).toStrictEqual([...OWN.widgets, extra]);
    const overlaid = withWidgetOverlaid(empty, 'medium', extra);
    expect(withArrangementFor(overlaid, 'medium', OWN).added).toBeUndefined();
    expect(withoutArrangementFor(overlaid, 'medium').added).toBeUndefined();
    expect(withDefaultArrangement(overlaid, 'medium').added).toBeUndefined();
  });

  it('leaves a following size alone and lets it show what the followed size shows', () => {
    const following = withFollowing(empty, 'compact', 'medium');
    expect(withWidgetOverlaid(following, 'compact', extra)).toBe(following);
    const both = withWidgetOverlaid(following, 'medium', extra);
    expect(arrangementOf(both, 'compact', DEFAULTS)).toStrictEqual([...DEFAULTS.medium, extra]);
  });
});
