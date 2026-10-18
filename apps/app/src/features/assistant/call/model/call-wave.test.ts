import { describe, expect, it } from 'vitest';
import {
  HISTORY_STEP_MS,
  WAVE_BARS,
  auraColourOf,
  auraOpacity,
  emptyHistory,
  liveHeights,
  pushLevel,
  smoothLevel,
  stillHeights,
  waveModeOf,
  waveMoves,
} from './call-wave';

const CENTRE = (WAVE_BARS - 1) / 2;

function peakIndex(heights: readonly number[]): number {
  return heights.indexOf(Math.max(...heights));
}

function average(heights: readonly number[]): number {
  return heights.reduce((sum, height) => sum + height, 0) / heights.length;
}

function spoken(level: number): readonly number[] {
  return pushLevel(emptyHistory(), level);
}

describe('wave mode', () => {
  it('follows the call phase and treats everything else as idle', () => {
    expect(waveModeOf('speaking')).toBe('speaking');
    expect(waveModeOf('listening')).toBe('listening');
    expect(waveModeOf('thinking')).toBe('thinking');
    expect(waveModeOf('connecting')).toBe('thinking');
    expect(waveModeOf('reconnecting')).toBe('idle');
    expect(waveModeOf('ended')).toBe('idle');
    expect(waveModeOf('idle')).toBe('idle');
  });

  it('stops moving when idle or when listening while muted', () => {
    expect(waveMoves('speaking', false)).toBe(true);
    expect(waveMoves('listening', false)).toBe(true);
    expect(waveMoves('thinking', false)).toBe(true);
    expect(waveMoves('idle', false)).toBe(false);
    expect(waveMoves('listening', true)).toBe(false);
  });
});

describe('history buffer', () => {
  it('keeps one entry per bar and puts the newest level last', () => {
    const next = pushLevel(emptyHistory(), 0.7);
    expect(next).toHaveLength(WAVE_BARS);
    expect(next.at(-1)).toBe(0.7);
    expect(pushLevel(next, 0.2).at(-2)).toBe(0.7);
  });

  it('steps every fifty milliseconds', () => {
    expect(HISTORY_STEP_MS).toBe(50);
  });
});

describe('speaking bars', () => {
  it('put the newest level in the middle and fan older levels outwards', () => {
    const fresh = liveHeights('speaking', spoken(1), 0);
    expect(peakIndex(fresh)).toBe(CENTRE);
    expect(fresh[CENTRE - 2]).toBeLessThan(fresh[CENTRE] ?? 0);
    expect(fresh[CENTRE + 2]).toBeLessThan(fresh[CENTRE] ?? 0);
    const later = liveHeights('speaking', pushLevel(spoken(1), 0), 0);
    expect(later[CENTRE]).toBeLessThan(fresh[CENTRE] ?? 0);
    expect(later[CENTRE - 1]).toBeGreaterThan(fresh[CENTRE - 1] ?? 1);
  });

  it('mirror around the centre bar', () => {
    const history = pushLevel(pushLevel(pushLevel(spoken(0.8), 0.8), 0.8), 0.8);
    const heights = liveHeights('speaking', history, 0);
    expect(heights[CENTRE - 3]).toBeGreaterThan(0.2);
    expect(Math.abs((heights[CENTRE - 3] ?? 0) - (heights[CENTRE + 3] ?? 1))).toBeLessThan(0.25);
    expect(heights[CENTRE - 12]).toBe(0.08);
    expect(heights[CENTRE + 12]).toBe(0.08);
  });
});

describe('listening bars', () => {
  it('show the newest level on the right and scroll it to the left', () => {
    const fresh = liveHeights('listening', spoken(1), 0);
    expect(peakIndex(fresh)).toBe(WAVE_BARS - 1);
    const later = liveHeights('listening', pushLevel(spoken(1), 0), 0);
    expect(peakIndex(later)).toBe(WAVE_BARS - 2);
  });

  it('stay flat for silence', () => {
    const heights = liveHeights('listening', emptyHistory(), 0);
    expect(new Set(heights).size).toBe(1);
  });
});

describe('thinking bars', () => {
  it('ignore the level, stay low and travel over time', () => {
    const loud = liveHeights('thinking', spoken(1), 1);
    const quiet = liveHeights('thinking', emptyHistory(), 1);
    expect(loud).toEqual(quiet);
    expect(Math.max(...loud)).toBeLessThan(0.4);
    expect(liveHeights('thinking', emptyHistory(), 1.4)).not.toEqual(quiet);
  });
});

describe('idle and muted bars', () => {
  it('are flat and faint when idle even with a level in the history', () => {
    const heights = liveHeights('idle', spoken(1), 3);
    expect(new Set(heights).size).toBe(1);
    expect(Math.max(...heights)).toBeLessThan(0.1);
  });

  it('are flatter when muted than when listening calmly', () => {
    const muted = stillHeights('listening', true);
    expect(new Set(muted).size).toBe(1);
    expect(Math.max(...stillHeights('listening', false))).toBeGreaterThan(Math.max(...muted));
  });
});

describe('reduced motion bars', () => {
  it('show a calm static shape per state', () => {
    const speaking = stillHeights('speaking', false);
    expect(average(speaking.slice(CENTRE - 4, CENTRE + 5))).toBeGreaterThan(
      average(speaking.slice(0, 8)),
    );
    expect(Math.max(...speaking)).toBeGreaterThan(Math.max(...stillHeights('listening', false)));
    expect(Math.max(...stillHeights('thinking', false))).toBeLessThan(0.3);
    expect(new Set(stillHeights('idle', false)).size).toBe(1);
  });

  it('is the same shape every time it is asked for', () => {
    expect(stillHeights('speaking', false)).toEqual(stillHeights('speaking', false));
  });
});

describe('level smoothing', () => {
  it('rises faster than it falls', () => {
    const rise = smoothLevel(0, 1, 16.7);
    const fall = 1 - smoothLevel(1, 0, 16.7);
    expect(rise).toBeGreaterThan(fall);
  });

  it('takes the same path at any frame rate', () => {
    const slow = smoothLevel(0, 1, 33.4);
    const fast = smoothLevel(smoothLevel(0, 1, 16.7), 1, 16.7);
    expect(slow).toBeCloseTo(fast, 5);
  });
});

describe('aura', () => {
  it('is amber while speaking, teal while listening, grey when muted, absent otherwise', () => {
    expect(auraColourOf('speaking', false)).toBe('primary');
    expect(auraColourOf('listening', false)).toBe('viz-1');
    expect(auraColourOf('listening', true)).toBe('on-surface-faint');
    expect(auraColourOf('thinking', false)).toBeNull();
    expect(auraColourOf('idle', false)).toBeNull();
  });

  it('brightens with the level, and is static when muted or when motion is reduced', () => {
    expect(auraOpacity(1, false, false)).toBeGreaterThan(auraOpacity(0, false, false));
    expect(auraOpacity(0.2, false, true)).toBe(auraOpacity(0.9, false, true));
    expect(auraOpacity(0.9, true, false)).toBe(auraOpacity(0, true, false));
    expect(auraOpacity(5, false, false)).toBeLessThanOrEqual(1);
  });
});
