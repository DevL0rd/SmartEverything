import { describe, expect, it } from 'vitest';
import { swipeChoiceOf, type SwipeMove } from './swipe';

const STILL: SwipeMove = { dx: 0, dy: 0, vx: 0, vy: 0, width: 400, height: 800 };

describe('viewer swipe', () => {
  it('steps to the older photo on a swipe left and the newer one on a swipe right', () => {
    expect(swipeChoiceOf({ ...STILL, dx: -120 })).toBe('next');
    expect(swipeChoiceOf({ ...STILL, dx: 120 })).toBe('previous');
  });

  it('steps on a short fling as well as a long drag', () => {
    expect(swipeChoiceOf({ ...STILL, dx: -30, vx: -1200 })).toBe('next');
    expect(swipeChoiceOf({ ...STILL, dx: -30, vx: -100 })).toBeNull();
  });

  it('closes on a swipe down but never on a swipe up', () => {
    expect(swipeChoiceOf({ ...STILL, dy: 200 })).toBe('close');
    expect(swipeChoiceOf({ ...STILL, dy: 40, vy: 1500 })).toBe('close');
    expect(swipeChoiceOf({ ...STILL, dy: -300, vy: -1500 })).toBeNull();
    expect(swipeChoiceOf({ ...STILL, dy: 60 })).toBeNull();
  });
});
