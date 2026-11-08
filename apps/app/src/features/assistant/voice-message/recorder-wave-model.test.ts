import { describe, expect, it } from 'vitest';
import {
  HOLD_WAVE,
  NO_BARS,
  SHEET_WAVE,
  decibelCopy,
  decibelsOf,
  liveBarCount,
  liveWavePath,
  peakCopy,
  pushLevel,
} from './recorder-wave-model';
import { LEVEL_SAMPLE_MS } from './voice-recorder-machine';

describe('live wave bars', () => {
  it('fits as many bars as the measured width holds', () => {
    expect(liveBarCount(0, SHEET_WAVE)).toBe(0);
    expect(liveBarCount(Number.NaN, SHEET_WAVE)).toBe(0);
    expect(liveBarCount(48, SHEET_WAVE)).toBe(10);
    expect(liveBarCount(46, HOLD_WAVE)).toBe(12);
  });

  it('adds one bar per level sample of recorded time and keeps the newest at the right', () => {
    const first = pushLevel(NO_BARS, 4, LEVEL_SAMPLE_MS, 0.2);
    expect(first).toEqual({ bars: [0.2], step: 1 });
    const same = pushLevel(first, 4, LEVEL_SAMPLE_MS + 10, 0.9);
    expect(same).toBe(first);
    const filled = pushLevel(first, 4, LEVEL_SAMPLE_MS * 3, 0.5);
    expect(filled).toEqual({ bars: [0.2, 0.5, 0.5], step: 3 });
    const scrolled = pushLevel(filled, 4, LEVEL_SAMPLE_MS * 5, 0.7);
    expect(scrolled.bars).toEqual([0.5, 0.5, 0.7, 0.7]);
  });

  it('never holds more bars than are visible after a long gap', () => {
    const state = pushLevel(NO_BARS, 3, LEVEL_SAMPLE_MS * 40, 1);
    expect(state.bars).toEqual([1, 1, 1]);
  });

  it('starts over when the recorded time goes back for a new recording', () => {
    const state = pushLevel({ bars: [0.4, 0.4], step: 9 }, 4, 0, 0.3);
    expect(state).toEqual({ bars: [], step: 0 });
  });

  it('holds no bars before the strip is measured', () => {
    expect(pushLevel(NO_BARS, 0, LEVEL_SAMPLE_MS * 8, 0.6)).toEqual({ bars: [], step: 8 });
  });

  it('draws only the bars in the span, right aligned, between the lowest and tallest height', () => {
    const whole = liveWavePath([0, 1], 4, { from: 0, to: 2 }, SHEET_WAVE);
    expect(whole.match(/M/g)).toHaveLength(2);
    expect(whole.startsWith('M10.00 ')).toBe(true);
    expect(whole).toContain('M15.00 4.50');
    expect(liveWavePath([0, 1], 4, { from: 1, to: 2 }, SHEET_WAVE).match(/M/g)).toHaveLength(1);
    expect(liveWavePath([], 4, { from: 0, to: 4 }, SHEET_WAVE)).toBe('');
  });
});

describe('level copy', () => {
  it('turns the normalised level back into whole decibels', () => {
    expect(decibelsOf(0)).toBe(-60);
    expect(decibelsOf(0.5)).toBe(-30);
    expect(decibelsOf(1)).toBe(-0);
    expect(decibelsOf(Number.NaN)).toBe(-60);
  });

  it('writes the live and peak captions with a true minus sign', () => {
    expect(decibelCopy(0.4333)).toBe('−34 dB');
    expect(decibelCopy(1)).toBe('0 dB');
    expect(peakCopy(0.85)).toBe('peak −9 dB');
  });
});
