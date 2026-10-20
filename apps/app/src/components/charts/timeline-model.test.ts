import { describe, expect, it } from 'vitest';
import {
  UnknownTimelineStateError,
  placeSegment,
  shareOf,
  windowOf,
  type TimelineFrame,
} from './timeline-model';
const FRAME: TimelineFrame = { from: 1000, span: 400, width: 200, height: 112 };
const SLEEP_LANES = ['awake', 'rem', 'light', 'deep'] as const;

describe('timeline placement', () => {
  it('puts a sleep segment where the old stage chart did', () => {
    expect(placeSegment({ start: 1100, end: 1300, state: 'light' }, SLEEP_LANES, FRAME)).toEqual({
      left: 50,
      width: 100,
      top: 56,
      height: 28,
    });
  });

  it('stacks the four sleep stages awake, rem, light, deep from the top', () => {
    const tops = SLEEP_LANES.map(
      (state) => placeSegment({ start: 1000, end: 1100, state }, SLEEP_LANES, FRAME).top,
    );
    expect(tops).toEqual([0, 28, 56, 84]);
  });

  it('uses the whole height on a single lane', () => {
    expect(placeSegment({ start: 1000, end: 1400, state: 'home' }, undefined, FRAME)).toEqual({
      left: 0,
      width: 200,
      top: 0,
      height: 112,
    });
  });

  it('keeps a zero-length segment visible as a three pixel mark inside its padding', () => {
    const place = placeSegment({ start: 1200, end: 1200, state: 'home' }, undefined, FRAME);
    expect(place.width).toBe(5);
  });

  it('keeps a five minute span on a 24 hour strip at least three pixels wide', () => {
    const day = 24 * 60 * 60_000;
    const strip: TimelineFrame = { from: 0, span: day, width: 300, height: 14 };
    const place = placeSegment(
      { start: day / 2, end: day / 2 + 5 * 60_000, state: 'talk' },
      undefined,
      strip,
    );
    expect(place.width - 2).toBeGreaterThanOrEqual(3);
  });

  it('does not stretch a span that is already wide', () => {
    expect(placeSegment({ start: 1000, end: 1200, state: 'home' }, undefined, FRAME).width).toBe(
      100,
    );
  });

  it('names a state that has no lane', () => {
    expect(() => placeSegment({ start: 0, end: 1, state: 'nap' }, SLEEP_LANES, FRAME)).toThrow(
      UnknownTimelineStateError,
    );
  });
});

describe('timeline window', () => {
  it('spans the segments when no window is given', () => {
    const segments = [
      { start: 30, end: 50, state: 'a' },
      { start: 10, end: 20, state: 'b' },
    ];
    expect(windowOf(segments, {})).toEqual({ from: 10, to: 50 });
  });

  it('prefers the given window so a 24 hour strip keeps its gaps', () => {
    expect(windowOf([{ start: 30, end: 50, state: 'a' }], { from: 0, to: 100 })).toEqual({
      from: 0,
      to: 100,
    });
  });

  it('has no window without segments or bounds', () => {
    expect(windowOf([], {})).toBeNull();
  });

  it('places a tick as a share of the window', () => {
    expect(shareOf(25, { from: 0, to: 100 })).toBe(0.25);
  });
});
