import { describe, expect, it } from 'vitest';
import type { WidgetFrameBox } from '../../../components/widget-board';
import { bodyHeightOf, narrowRowsOf, ringSizeOf } from './rings-size';

const DESKTOP_WIDE: WidgetFrameBox = { width: 1072, height: 120, idiom: 'pointer' };
const PHONE_MEDIUM: WidgetFrameBox = { width: 326, height: 140, idiom: 'touch' };

describe('bodyHeightOf', () => {
  it('removes the header and its gap from the frame height', () => {
    expect(bodyHeightOf(DESKTOP_WIDE)).toBe(76);
    expect(bodyHeightOf(PHONE_MEDIUM)).toBe(88);
  });
});

describe('ringSizeOf', () => {
  it('shrinks the ring to the height left under the header so it is not clipped', () => {
    expect(ringSizeOf(DESKTOP_WIDE, 120)).toBe(76);
    expect(ringSizeOf(PHONE_MEDIUM, 108)).toBe(88);
  });

  it('keeps the wanted size when the body is tall enough', () => {
    expect(ringSizeOf({ width: 508, height: 296, idiom: 'pointer' }, 108)).toBe(108);
  });

  it('never goes below the smallest readable ring', () => {
    expect(ringSizeOf({ width: 200, height: 60, idiom: 'touch' }, 108)).toBe(56);
  });
});

describe('narrowRowsOf', () => {
  it('stacks the ring rows when less than 200 px is left beside the ring', () => {
    expect(narrowRowsOf({ ...PHONE_MEDIUM, width: 290 }, 88)).toBe(true);
    expect(narrowRowsOf(PHONE_MEDIUM, 88)).toBe(false);
    expect(narrowRowsOf({ width: 508, height: 296, idiom: 'pointer' }, 108)).toBe(false);
  });
});
