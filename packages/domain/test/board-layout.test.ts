import { describe, expect, it } from 'vitest';
import {
  BOARD_ARRANGEMENT,
  BOARD_LAYOUT,
  BOARD_LAYOUT_VERSION,
  readBoardLayout,
  withArrangementFor,
  withKnownWidgets,
  type BoardLayout,
} from '../src';

const LAYOUT: BoardLayout = {
  version: BOARD_LAYOUT_VERSION,
  classes: {
    compact: {
      widgets: [
        { key: 'body', type: 'body', size: 'M' },
        { key: 'steps', type: 'steps', size: 'M', options: { goal: 8000 } },
      ],
    },
    expanded: { widgets: [{ key: 'ghost', type: 'ghost', size: 'W' }] },
  },
};

describe('retired widget sizes', () => {
  it('reads a stored small widget as medium and a large one as extra large, keeping order', () => {
    const stored = {
      version: BOARD_LAYOUT_VERSION,
      classes: {
        compact: {
          widgets: [
            { key: 'a', type: 'a', size: 'S' },
            { key: 'b', type: 'b', size: 'L' },
            { key: 'c', type: 'c', size: 'W' },
          ],
        },
      },
    };
    const read = readBoardLayout(stored);
    expect(read.status).toBe('stored');
    const sizes =
      read.status === 'stored' ? read.layout.classes.compact?.widgets.map((w) => w.size) : [];
    expect(sizes).toStrictEqual(['M', 'XL', 'W']);
  });
});

describe('readBoardLayout', () => {
  it('reports a missing layout as absent', () => {
    expect(readBoardLayout(null)).toStrictEqual({ status: 'absent' });
    expect(readBoardLayout(undefined)).toStrictEqual({ status: 'absent' });
  });

  it('returns a version 2 layout as stored with no migration work', () => {
    expect(readBoardLayout(LAYOUT)).toStrictEqual({ status: 'stored', layout: LAYOUT });
  });

  it('reports a version 1 layout as invalid instead of migrating it on read', () => {
    const legacy = {
      wide: { widgets: [{ id: 'weigh_in', span: 6, hidden: false }] },
      narrow: { widgets: [{ id: 'weigh_in', span: 2, hidden: false }] },
    };
    const read = readBoardLayout(legacy);
    expect(read.status).toBe('invalid');
    expect(read.status === 'invalid' && read.reason).toContain('not a version 2 layout');
  });

  it('keeps a renamed widget type as stored', () => {
    const stored = {
      version: 2,
      classes: { compact: { widgets: [{ key: 'w', type: 'weigh-in', size: 'M' }] } },
    };
    expect(readBoardLayout(stored)).toStrictEqual({ status: 'stored', layout: stored });
  });
});

describe('board layout edits', () => {
  it('rejects an arrangement with a repeated widget key', () => {
    const widget = { key: 'a', type: 'steps', size: 'M' };
    expect(BOARD_ARRANGEMENT.safeParse({ widgets: [widget, widget] }).success).toBe(false);
    expect(BOARD_LAYOUT.safeParse(LAYOUT).success).toBe(true);
  });

  it('drops widgets of unknown types per class and lists each once', () => {
    const known = withKnownWidgets(LAYOUT, new Set(['body', 'steps']));
    expect(known.dropped).toStrictEqual(['ghost']);
    expect(known.layout.classes.compact).toStrictEqual(LAYOUT.classes.compact);
    expect(known.layout.classes.expanded).toStrictEqual({ widgets: [] });
    expect(known.layout.classes.medium).toBeUndefined();
  });

  it('replaces the arrangement of one class', () => {
    const next = withArrangementFor(LAYOUT, 'medium', { widgets: [] });
    expect(next.classes.medium).toStrictEqual({ widgets: [] });
    expect(next.classes.compact).toStrictEqual(LAYOUT.classes.compact);
    expect(next.version).toBe(BOARD_LAYOUT_VERSION);
  });
});
