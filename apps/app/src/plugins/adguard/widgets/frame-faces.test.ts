import { describe, expect, it } from 'vitest';
import type { FrameClass } from '../../../components/widget-board';
import {
  BLOCKING_WIDGET_SIZES,
  blockingFaceOf,
  bodyHeightOf,
  compactLayoutOf,
  topRowsOf,
  wideBarsHeightOf,
} from './frame-faces';

const CLASSES: readonly FrameClass[] = ['xs', 's', 'm', 'l', 'w', 'xl'];

describe('blockingFaceOf', () => {
  it('chooses the face from the frame class and never from the size letter', () => {
    expect(CLASSES.map(blockingFaceOf)).toEqual([
      'compact',
      'tile',
      'compact',
      'tall',
      'wide',
      'wide',
    ]);
  });
});

describe('BLOCKING_WIDGET_SIZES', () => {
  it('keeps Wide off the phone board', () => {
    expect(BLOCKING_WIDGET_SIZES.compact).toEqual(['M', 'XL']);
    expect(BLOCKING_WIDGET_SIZES.medium).toContain('W');
    expect(BLOCKING_WIDGET_SIZES.expanded).toContain('W');
  });
});

describe('bodyHeightOf', () => {
  it('removes the header and gap, larger on touch than with a pointer', () => {
    const touch = bodyHeightOf({ width: 300, height: 160, idiom: 'touch' });
    const pointer = bodyHeightOf({ width: 300, height: 160, idiom: 'pointer' });
    expect(touch).toBe(108);
    expect(pointer).toBe(116);
    expect(bodyHeightOf({ width: 300, height: 20, idiom: 'touch' })).toBe(0);
  });
});

describe('compactLayoutOf', () => {
  it('uses the large figure when the bars still fit and the medium one otherwise', () => {
    expect(compactLayoutOf(130)).toEqual({ figure: 'l', bars: 40 });
    expect(compactLayoutOf(100)).toEqual({ figure: 'l', bars: 26 });
    expect(compactLayoutOf(85)).toEqual({ figure: 'm', bars: 23 });
  });

  it('drops the bars when nothing is left for them', () => {
    expect(compactLayoutOf(60)).toEqual({ figure: 'm', bars: null });
  });
});

describe('wideBarsHeightOf and topRowsOf', () => {
  it('keeps the wide bars between 24 and 120', () => {
    expect(wideBarsHeightOf(10)).toBe(24);
    expect(wideBarsHeightOf(80)).toBe(80);
    expect(wideBarsHeightOf(400)).toBe(120);
  });

  it('shows up to five top rows only when the body is tall enough', () => {
    expect(topRowsOf(120)).toBe(0);
    expect(topRowsOf(220)).toBe(3);
    expect(topRowsOf(600)).toBe(5);
  });
});
