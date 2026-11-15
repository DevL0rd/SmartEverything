import { describe, expect, it } from 'vitest';
import { revealOffset, SCROLL_STEP, scrollStepOf } from './h-scroller-step';

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

describe('revealOffset', () => {
  it('scrolls an item past the end into view with a margin', () => {
    expect(revealOffset({ x: 500, width: 100 }, 0, 400)).toBe(224);
  });

  it('scrolls back to an item before the start and never below zero', () => {
    expect(revealOffset({ x: 200, width: 80 }, 300, 400)).toBe(176);
    expect(revealOffset({ x: 10, width: 80 }, 300, 400)).toBe(0);
  });

  it('leaves the row alone when the item is already in view', () => {
    expect(revealOffset({ x: 100, width: 80 }, 0, 400)).toBeNull();
  });
});
