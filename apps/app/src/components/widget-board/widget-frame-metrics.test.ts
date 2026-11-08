import { describe, expect, it } from 'vitest';
import { widgetBodyHeight } from './widget-frame-metrics';

describe('widgetBodyHeight', () => {
  it('reserves the surface borders, header and gap for touch and pointer frames', () => {
    expect(widgetBodyHeight({ width: 326, height: 324, idiom: 'touch' })).toBe(270);
    expect(widgetBodyHeight({ width: 508, height: 296, idiom: 'pointer' })).toBe(250);
  });

  it('requires space for both hairlines when fixed-height rows exactly fit the body', () => {
    const frame = { width: 348, height: 148, idiom: 'touch' } as const;
    const rowsHeight = 2 * 48;
    expect(widgetBodyHeight(frame)).toBeLessThan(rowsHeight);
    expect(widgetBodyHeight({ ...frame, height: 150 })).toBe(rowsHeight);
  });
});
