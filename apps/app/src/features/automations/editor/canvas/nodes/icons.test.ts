import { describe, expect, it } from 'vitest';
import { ALL_NODE_KINDS } from '@smarteverything/domain';
import { isIconName } from '../../../../../components/icon-glyphs';
import { hasGlyph } from './icons';

describe('node icons', () => {
  it('draws an icon for every node kind', () => {
    const without = ALL_NODE_KINDS.filter(
      (kind) => !hasGlyph(kind.icon) && !isIconName(kind.icon),
    ).map((kind) => `${kind.id}: ${kind.icon}`);
    expect(without).toEqual([]);
  });
});
