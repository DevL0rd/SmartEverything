import { describe, expect, it } from 'vitest';
import {
  RING_MIN_PX,
  RING_PX,
  SPARK_MIN_PX,
  SPARK_PX,
  TIMELINE_CAPTIONS_PX,
  TRACK_MIN_PX,
  emptyStripPx,
  roomWithin,
  shownPx,
  trackPx,
} from './layout';

describe('the graph room left above the action band', () => {
  it('never grows past the tier size and never goes below zero', () => {
    expect(roomWithin(RING_PX.m, 400)).toBe(RING_PX.m);
    expect(roomWithin(RING_PX.m, 30.6)).toBe(30);
    expect(roomWithin(RING_PX.m, -4)).toBe(0);
  });

  it('keeps the tier size when the room is larger', () => {
    expect(shownPx(SPARK_PX.xl, 200, SPARK_MIN_PX)).toBe(SPARK_PX.xl);
  });

  it('shrinks a chart to the measured room', () => {
    expect(shownPx(RING_PX.l, 60, RING_MIN_PX)).toBe(60);
    expect(shownPx(SPARK_PX.w, 20, SPARK_MIN_PX)).toBe(20);
  });

  it('leaves a chart out when the room cannot hold its own label', () => {
    expect(shownPx(RING_PX.m, RING_MIN_PX - 1, RING_MIN_PX)).toBeNull();
    expect(shownPx(SPARK_PX.m, SPARK_MIN_PX - 1, SPARK_MIN_PX)).toBeNull();
  });

  it('holds the ring label and both strokes at the smallest ring', () => {
    expect(RING_MIN_PX).toBeLessThanOrEqual(RING_PX.m);
  });

  it('keeps the timeline captions inside the room and thins the strip first', () => {
    expect(trackPx(28, 28 + TIMELINE_CAPTIONS_PX)).toBe(28);
    expect(trackPx(28, 12 + TIMELINE_CAPTIONS_PX)).toBe(12);
    expect(trackPx(28, TRACK_MIN_PX - 1 + TIMELINE_CAPTIONS_PX)).toBeNull();
  });

  it('fits an empty day line to the room without the timeline captions', () => {
    expect(emptyStripPx(24, 24 + TIMELINE_CAPTIONS_PX)).toBe(24);
    expect(emptyStripPx(24, 18)).toBe(18);
    expect(emptyStripPx(24, SPARK_MIN_PX - 1)).toBeNull();
  });
});
