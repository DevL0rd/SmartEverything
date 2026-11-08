import { describe, expect, it } from 'vitest';
import type { WidgetFrameBox } from '../../../components/widget-board/frame-class';
import { widgetBodyHeight } from '../../../components/widget-board/widget-frame-metrics';
import { TYPE_SCALE } from '../../../design/tokens';
import { ringSizeOf, stripFigureOf, tallRingOf } from './rings-size';

const PHONE_MEDIUM: WidgetFrameBox = { width: 348, height: 140, idiom: 'touch' };
const DESKTOP_MEDIUM: WidgetFrameBox = { width: 640, height: 120, idiom: 'pointer' };
const PHONE_XL: WidgetFrameBox = { width: 348, height: 324, idiom: 'touch' };
const DESKTOP_XL: WidgetFrameBox = { width: 1350, height: 296, idiom: 'pointer' };

describe('ringSizeOf', () => {
  it('fills the body height under the shared header so the ring is never clipped', () => {
    expect(ringSizeOf(PHONE_MEDIUM)).toBe(Math.floor(widgetBodyHeight(PHONE_MEDIUM)));
    expect(ringSizeOf(DESKTOP_MEDIUM)).toBe(Math.floor(widgetBodyHeight(DESKTOP_MEDIUM)));
    expect(ringSizeOf(PHONE_MEDIUM)).toBeLessThanOrEqual(widgetBodyHeight(PHONE_MEDIUM));
  });

  it('never goes below the smallest readable ring', () => {
    expect(ringSizeOf({ width: 200, height: 60, idiom: 'touch' })).toBe(56);
  });
});

describe('tallRingOf', () => {
  it('leaves exactly the room the cheer line and the three ring rows need', () => {
    for (const frame of [PHONE_XL, DESKTOP_XL]) {
      const type = TYPE_SCALE[frame.idiom];
      const rows = 3 * (type.footnote[1] + 2 + 6) + 2 * 12;
      const used = tallRingOf(frame, 3) + type.callout[1] + 8 + 12 + rows;
      expect(used).toBeLessThanOrEqual(widgetBodyHeight(frame));
      expect(widgetBodyHeight(frame) - used).toBeLessThan(1);
    }
  });

  it('grows with the XL body instead of keeping a fixed size', () => {
    expect(tallRingOf(PHONE_XL, 3)).toBeGreaterThan(tallRingOf(DESKTOP_XL, 3));
  });
});

describe('stripFigureOf', () => {
  it('uses the medium figure when the column fits the body and the small one otherwise', () => {
    expect(stripFigureOf(PHONE_MEDIUM)).toBe('m');
    expect(stripFigureOf(DESKTOP_MEDIUM)).toBe('s');
    expect(stripFigureOf({ ...DESKTOP_MEDIUM, height: 124 })).toBe('m');
  });
});
