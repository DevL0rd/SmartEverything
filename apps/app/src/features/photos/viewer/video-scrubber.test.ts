import { describe, expect, it } from 'vitest';
import {
  FRAME_WIDTH,
  IdleControls,
  SEEK_STEP_S,
  VideoScrubber,
  frameLeft,
  scrubLabel,
  secondsAt,
  shareOf,
  steppedSeconds,
} from './video-scrubber';

describe('video scrubber', () => {
  it('loads the components the player shows', () => {
    expect(typeof VideoScrubber).toBe('function');
    expect(typeof IdleControls).toBe('function');
  });

  it('maps a position to the track and back within the clip', () => {
    expect(shareOf(67, 161)).toBeCloseTo(0.416, 3);
    expect(shareOf(-3, 161)).toBe(0);
    expect(shareOf(200, 161)).toBe(1);
    expect(shareOf(10, 0)).toBe(0);
    expect(secondsAt(0.5, 161)).toBe(80.5);
    expect(secondsAt(1.4, 161)).toBe(161);
    expect(secondsAt(-0.2, 161)).toBe(0);
  });

  it('reads the position as now of length', () => {
    expect(scrubLabel(67, 161)).toBe('1:07 of 2:41');
    expect(scrubLabel(3725, 7200)).toBe('1:02:05 of 2:00:00');
  });

  it('keeps the frame preview over the finger and inside the track', () => {
    expect(frameLeft(0.5, 300, FRAME_WIDTH)).toBe(90);
    expect(frameLeft(0, 300, FRAME_WIDTH)).toBe(0);
    expect(frameLeft(1, 300, FRAME_WIDTH)).toBe(180);
    expect(frameLeft(0.5, 80, FRAME_WIDTH)).toBe(0);
  });

  it('steps by the accessibility step without leaving the clip', () => {
    expect(steppedSeconds(30, 161, 1)).toBe(30 + SEEK_STEP_S);
    expect(steppedSeconds(5, 161, -1)).toBe(0);
    expect(steppedSeconds(158, 161, 1)).toBe(161);
  });
});
