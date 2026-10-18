import { describe, expect, it } from 'vitest';
import { advanceTrail, NO_TRAIL, TRAIL_FRAMES, type TrailState } from './track-trail';

const track = (id: number, x: number): { id: number; x: number; y: number; z: number } => ({
  id,
  x,
  y: 1,
  z: 0,
});

function walk(keep: boolean, frames: number): TrailState {
  let state: TrailState = { at: null, shown: [], trail: NO_TRAIL };
  for (let step = 1; step <= frames; step += 1)
    state = advanceTrail(state, { at: `t${String(step)}`, tracks: [track(1, step)] }, keep);
  return state;
}

describe('track trail', () => {
  it('keeps the last three frames behind the current one', () => {
    const state = walk(true, 6);
    expect(state.trail).toHaveLength(TRAIL_FRAMES);
    expect(state.trail.map((frame) => frame[0]?.x)).toStrictEqual([5, 4, 3]);
    expect(state.shown[0]?.x).toBe(6);
  });

  it('does not change on a repeated frame', () => {
    const state = walk(true, 2);
    expect(advanceTrail(state, { at: 't2', tracks: [track(1, 2)] }, true)).toBe(state);
  });

  it('draws no trail under reduced motion', () => {
    expect(walk(false, 5).trail).toHaveLength(0);
  });

  it('clears the trail as soon as tracking stops', () => {
    const state = walk(true, 4);
    const stopped = advanceTrail(state, { at: 't4', tracks: [track(1, 4)] }, false);
    expect(stopped.trail).toHaveLength(0);
  });
});
