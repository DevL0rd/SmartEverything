import { describe, expect, it } from 'vitest';
import { workoutFactCount } from './workout-facts-count';

describe('workoutFactCount', () => {
  it('shows five facts across the wide frame', () => {
    expect(workoutFactCount('w', { width: 660 })).toBe(5);
  });

  it('shows four facts when the frame is at least 300 wide', () => {
    expect(workoutFactCount('m', { width: 508 })).toBe(4);
    expect(workoutFactCount('l', { width: 308 })).toBe(4);
    expect(workoutFactCount('xl', { width: 300 })).toBe(4);
  });

  it('shows three facts on a phone-width frame', () => {
    expect(workoutFactCount('m', { width: 244 })).toBe(3);
    expect(workoutFactCount('l', { width: 299 })).toBe(3);
  });
});
