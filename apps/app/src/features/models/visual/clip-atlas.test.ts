import { describe, expect, it } from 'vitest';
import {
  cellOffset,
  clipFrame,
  heldFrame,
  rectStyle,
  stepClip,
  type ClipCounter,
} from './clip-atlas';
import type { ClipResult } from '../bake/bake-protocol';
import { clipImage } from './visual-fixture';

const CLIP = clipImage({});

interface CountedCounter extends ClipCounter {
  readonly writes: number[];
}

function counter(start: number): CountedCounter {
  let value = start;
  const writes: number[] = [];
  return {
    writes,
    get: (): number => value,
    set: (next): void => {
      value = next;
      writes.push(next);
    },
  };
}

interface Played {
  readonly elapsed: CountedCounter;
  readonly cell: CountedCounter;
}

function playFor(clip: ClipResult, rate: number, seconds: number, hz: number): Played {
  const elapsed = counter(0);
  const cell = counter(clipFrame(clip, 0, rate));
  for (let tick = 0; tick < seconds * hz; tick += 1) {
    stepClip({ elapsed, cell }, clip, rate, 1 / hz);
  }
  return { elapsed, cell };
}

describe('clip atlas playback', () => {
  it('plays the intro frames once, then loops the loop frames by elapsed time', () => {
    expect(clipFrame(CLIP, 0.05, 1)).toBe(0);
    expect(clipFrame(CLIP, 0.15, 1)).toBe(1);
    expect(clipFrame(CLIP, 0.2, 1)).toBe(2);
    expect(clipFrame(CLIP, 1.15, 1)).toBe(11);
    expect(clipFrame(CLIP, 1.25, 1)).toBe(2);
  });

  it('maps the device speed to the loop playback rate and plays backwards for a negative rate', () => {
    expect(clipFrame(CLIP, 0.45, 2)).toBe(7);
    expect(clipFrame(CLIP, 0.35, -1)).toBe(11);
  });

  it('holds the shot still frame after the intro when not playing', () => {
    expect(heldFrame(CLIP)).toBe(5);
    expect(heldFrame(clipImage({ stillFrame: 13 }))).toBe(5);
  });

  it('moves the sheet so the wanted cell sits in the clipped window', () => {
    expect(cellOffset(CLIP, 0)).toEqual({ x: -0, y: -0 });
    expect(cellOffset(CLIP, 5)).toEqual({ x: -30, y: -40 });
    expect(cellOffset(CLIP, 11)).toEqual({ x: -90, y: -80 });
  });

  it('places the clipped window at the crop rectangle of the bake', () => {
    expect(rectStyle(CLIP.rect)).toEqual({ left: 10, top: 20, width: 30, height: 40 });
  });

  it('writes the atlas cell 12 times a second at 60 Hz for a 12 frames per second clip', () => {
    const clip = clipImage({
      frameS: 1 / 12,
      introFrames: 10,
      loopFrames: 36,
      rows: 4,
      columns: 12,
    });
    const { elapsed, cell } = playFor(clip, 1, 3, 60);
    expect(elapsed.writes).toHaveLength(180);
    expect(cell.writes.length).toBeGreaterThanOrEqual(35);
    expect(cell.writes.length).toBeLessThanOrEqual(36);
    expect(cell.writes.every((value, index) => value !== (cell.writes[index - 1] ?? -1))).toBe(
      true,
    );
  });

  it('writes the cell only when the loop frame changes at a slower device speed', () => {
    const clip = clipImage({
      frameS: 1 / 12,
      introFrames: 0,
      loopFrames: 36,
      rows: 3,
      columns: 12,
    });
    const { cell } = playFor(clip, 0.5, 2, 60);
    expect(cell.writes.length).toBeGreaterThanOrEqual(11);
    expect(cell.writes.length).toBeLessThanOrEqual(12);
  });
});
