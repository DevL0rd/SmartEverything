import { describe, expect, it } from 'vitest';
import { PANE_KEY_STEP, clampPaneWidth, widthAfterDrag, widthAfterStep } from './docked-pane';

const LIMITS = { min: 240, max: 560 } as const;

describe('docked pane sizing', () => {
  it('clamps the width into its limits and rounds to whole pixels', () => {
    expect(clampPaneWidth(100, 240, 560)).toBe(240);
    expect(clampPaneWidth(900, 240, 560)).toBe(560);
    expect(clampPaneWidth(300.6, 240, 560)).toBe(301);
  });

  it('grows a right pane when the handle is dragged left and a left pane when dragged right', () => {
    expect(widthAfterDrag('right', 380, -40, LIMITS)).toBe(420);
    expect(widthAfterDrag('right', 380, 40, LIMITS)).toBe(340);
    expect(widthAfterDrag('left', 280, 40, LIMITS)).toBe(320);
    expect(widthAfterDrag('left', 280, -400, LIMITS)).toBe(240);
  });

  it('steps by a fixed amount for the accessibility actions and stops at the limits', () => {
    expect(widthAfterStep(300, 'increment', LIMITS)).toBe(300 + PANE_KEY_STEP);
    expect(widthAfterStep(300, 'decrement', LIMITS)).toBe(300 - PANE_KEY_STEP);
    expect(widthAfterStep(555, 'increment', LIMITS)).toBe(560);
    expect(widthAfterStep(245, 'decrement', LIMITS)).toBe(240);
  });
});
