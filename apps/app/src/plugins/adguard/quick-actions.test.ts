import { describe, expect, it, vi } from 'vitest';
import { PAUSE_CHOICES } from './model/pause-model';
import { pauseMenuItems } from './quick-actions';

describe('pauseMenuItems', () => {
  it('offers exactly the pause durations of the pause model, in order', () => {
    const items = pauseMenuItems(vi.fn(), vi.fn());
    expect(items.map((item) => item.label)).toEqual(
      PAUSE_CHOICES.map((choice) => `For ${choice.spoken}`),
    );
  });

  it('pauses for the tapped duration and hands the work to the runner', () => {
    const work = Promise.resolve(null);
    const pauseFor = vi.fn(() => work);
    const run = vi.fn();
    const items = pauseMenuItems(pauseFor, run);
    items[1]?.onPress();
    expect(pauseFor).toHaveBeenCalledExactlyOnceWith(PAUSE_CHOICES[1]);
    expect(PAUSE_CHOICES[1]?.minutes).toBe(60);
    expect(run).toHaveBeenCalledExactlyOnceWith(work);
  });
});
