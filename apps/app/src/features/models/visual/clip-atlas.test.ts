import { describe, expect, it } from 'vitest';
import { cellOffset, clipFrame, heldFrame, rectStyle } from './clip-atlas';
import { clipImage } from './visual-fixture';

const CLIP = clipImage({});

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
});
