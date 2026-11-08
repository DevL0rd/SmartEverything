import { describe, expect, it } from 'vitest';
import { placePlan, type ChromeBox } from './stage-fit';

const area = { width: 380, height: 285, left: 16, right: 16, top: 16, bottom: 16 };

const span = { x: 1.07, y: 1 };

function meets(a: ChromeBox, b: ChromeBox): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

describe('placing the flat plan around the stage chrome', () => {
  it('centres the largest plan when nothing is in the way', () => {
    const place = placePlan(area, span, []);
    expect(place.scale).toBeCloseTo(253, 0);
    expect(place.y).toBeCloseTo(16, 5);
    expect(place.x + (span.x * place.scale) / 2).toBeCloseTo(190, 5);
  });

  it('keeps clear of the pill, switcher and tools and stays far larger than fixed bands', () => {
    const chrome: readonly ChromeBox[] = [
      { x: 12, y: 12, w: 140, h: 44 },
      { x: 146, y: 12, w: 222, h: 48 },
      { x: 276, y: 225, w: 92, h: 48 },
    ];
    const place = placePlan(area, span, chrome);
    const plan = { x: place.x, y: place.y, w: span.x * place.scale, h: span.y * place.scale };
    expect(chrome.some((box) => meets(box, plan))).toBe(false);
    expect(plan.h).toBeGreaterThan(180);
    expect(plan.x).toBeGreaterThanOrEqual(16);
    expect(plan.y + plan.h).toBeLessThanOrEqual(285 - 16 + 0.5);
  });
});
