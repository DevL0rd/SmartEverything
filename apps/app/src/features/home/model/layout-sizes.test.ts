import { describe, expect, it } from 'vitest';
import {
  BOARD_CLASSES,
  BOARD_LAYOUT_VERSION,
  withFollowing,
  type BoardDefaultWidgets,
  type BoardLayout,
} from '@smarteverything/domain';
import { copyConfirmBody, layoutSizeRows, resetConfirmBody, sourceText } from './layout-sizes';

const DEFAULTS: BoardDefaultWidgets = {
  compact: [{ key: 'a', type: 'glance', size: 'W' }],
  medium: [
    { key: 'a', type: 'glance', size: 'M' },
    { key: 'b', type: 'weather', size: 'M' },
  ],
  expanded: [],
};

const LAYOUT: BoardLayout = {
  version: BOARD_LAYOUT_VERSION,
  classes: {
    compact: {
      widgets: [
        { key: 'x', type: 'steps', size: 'M' },
        { key: 'y', type: 'body', size: 'M' },
        { key: 'z', type: 'watch', size: 'M' },
      ],
    },
  },
};

describe('layout size rows', () => {
  it('has one row per board class the domain defines, in order', () => {
    expect(layoutSizeRows(null, DEFAULTS, 'compact').map((row) => row.board)).toEqual([
      ...BOARD_CLASSES,
    ]);
  });

  it('counts own, default and followed arrangements', () => {
    const following = withFollowing(LAYOUT, 'expanded', 'compact');
    const rows = layoutSizeRows(following, DEFAULTS, 'medium');
    expect(rows.map((row) => [row.board, row.count, row.source, row.current])).toEqual([
      ['compact', 3, 'own', false],
      ['medium', 2, 'default', true],
      ['expanded', 3, 'following', false],
    ]);
    expect(rows.map(sourceText)).toEqual([
      'Your own arrangement',
      'Default arrangement',
      'Following Compact',
    ]);
  });

  it('describes the consequences in plain words', () => {
    expect(copyConfirmBody('compact', 'medium', true)).toContain('will be replaced');
    expect(copyConfirmBody('compact', 'medium', false)).toContain('not customised');
    expect(resetConfirmBody('medium')).toContain('built-in default');
  });
});
