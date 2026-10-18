import { describe, expect, it } from 'vitest';
import { SCROLL_STEP, scrollStepOf } from './h-scroller-step';

describe('scrollStepOf', () => {
  it('keeps the fixed step when there is no snap interval', () => {
    expect(scrollStepOf(undefined)).toBe(SCROLL_STEP);
  });

  it('steps by a whole number of snap intervals', () => {
    expect(scrollStepOf(150)).toBe(300);
    expect(scrollStepOf(100)).toBe(300);
  });

  it('steps by one card when a card is wider than the step', () => {
    expect(scrollStepOf(500)).toBe(500);
  });
});
