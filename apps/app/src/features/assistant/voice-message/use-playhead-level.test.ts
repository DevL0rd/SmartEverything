import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native-reanimated', () => ({
  useDerivedValue: vi.fn(),
  useSharedValue: vi.fn(),
  withSpring: vi.fn(),
}));
vi.mock('../../../design/motion', () => ({ SPRING: {} }));
vi.mock('../../../design/animation-gate', () => ({ useAnimationGate: vi.fn() }));

const { barCountFor, levelAt, resampleLevels, usePlayheadLevel } =
  await import('./use-playhead-level');

describe('bar count', () => {
  it('fits 2 px bars with 1 px gaps', () => {
    expect(barCountFor(0)).toBe(0);
    expect(barCountFor(2)).toBe(1);
    expect(barCountFor(5)).toBe(2);
    expect(barCountFor(150)).toBe(50);
    expect(barCountFor(Number.NaN)).toBe(0);
  });
});

describe('resampling levels', () => {
  it('keeps the peak of each bucket when shrinking', () => {
    expect(resampleLevels([10, 50, 20, 30, 255, 0], 3)).toStrictEqual([50, 30, 255]);
  });

  it('repeats levels when stretching', () => {
    expect(resampleLevels([100, 200], 4)).toStrictEqual([100, 100, 200, 200]);
  });

  it('returns nothing without levels or width', () => {
    expect(resampleLevels([], 4)).toStrictEqual([]);
    expect(resampleLevels([1, 2], 0)).toStrictEqual([]);
  });
});

describe('level at the playhead', () => {
  const levels = [0, 255, 51];

  it('reads one value per 50 ms as a share of the maximum', () => {
    expect(levelAt(levels, 0)).toBe(0);
    expect(levelAt(levels, 0.05)).toBe(1);
    expect(levelAt(levels, 0.1)).toBe(0.2);
  });

  it('clamps to the clip and ignores bad positions', () => {
    expect(levelAt(levels, 99)).toBe(0.2);
    expect(levelAt(levels, -1)).toBe(0);
    expect(levelAt(levels, Number.NaN)).toBe(0);
    expect(levelAt([], 1)).toBe(0);
  });

  it('exposes the hook', () => {
    expect(typeof usePlayheadLevel).toBe('function');
  });
});
