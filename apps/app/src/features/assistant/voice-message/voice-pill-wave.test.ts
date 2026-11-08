import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native-reanimated', () => ({
  useDerivedValue: vi.fn(),
  useSharedValue: vi.fn(),
  withSpring: vi.fn(),
}));
vi.mock('../../../design/motion', () => ({ SPRING: {} }));
vi.mock('../../../design/animation-gate', () => ({ useAnimationGate: vi.fn() }));

const { MIN_BAR, SWELL_GAIN, WAVE_HEIGHT, barHeights, playedBars, shareAt, tenthOf, wavePath } =
  await import('./voice-pill-wave');

function barsIn(path: string): readonly number[] {
  return [...path.matchAll(/v(-?[\d.]+)/g)].map((match) => Number(match[1]) + 2);
}

describe('bar heights', () => {
  it('keeps silent windows at the minimum height', () => {
    expect(barHeights([0, 0, 0], 3)).toStrictEqual([MIN_BAR, MIN_BAR, MIN_BAR]);
  });

  it('draws flat minimum bars when the clip has no levels', () => {
    expect(barHeights([], 4)).toStrictEqual([MIN_BAR, MIN_BAR, MIN_BAR, MIN_BAR]);
  });

  it('leaves room for the loudest bar to swell inside the wave', () => {
    const [loudest = 0] = barHeights([255], 1);
    expect(loudest * (1 + SWELL_GAIN)).toBeCloseTo(WAVE_HEIGHT);
  });

  it('scales peaks to the measured bar count', () => {
    const heights = barHeights([0, 255, 0, 0], 2);
    expect(heights).toHaveLength(2);
    expect(heights[0]).toBeGreaterThan(heights[1] ?? 0);
  });
});

describe('wave path', () => {
  const heights = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10];

  it('draws one rounded bar per height in the span', () => {
    const path = wavePath(heights, { from: 0, to: 5, centre: -10, swell: 1 });
    expect(path.match(/M/g)).toHaveLength(5);
    expect(barsIn(path)).toStrictEqual([10, 10, 10, 10, 10]);
  });

  it('swells only the bars around the playhead', () => {
    const path = wavePath(heights, { from: 0, to: 12, centre: 6, swell: 1.35 });
    const bars = barsIn(path);
    expect(bars[6]).toBeCloseTo(13.5);
    expect(bars[3]).toBeCloseTo(13.5);
    expect(bars[2]).toBe(10);
    expect(bars[10]).toBe(10);
  });

  it('never draws past the wave height', () => {
    const path = wavePath([WAVE_HEIGHT], { from: 0, to: 1, centre: 0, swell: 2 });
    expect(barsIn(path)[0]).toBeCloseTo(WAVE_HEIGHT);
  });

  it('places bars 3 px apart', () => {
    const path = wavePath(heights, { from: 2, to: 4, centre: -10, swell: 1 });
    expect([...path.matchAll(/M([\d.]+)/g)].map((match) => Number(match[1]))).toStrictEqual([6, 9]);
  });
});

describe('scrub maths', () => {
  it('splits played bars by the playhead share', () => {
    expect(playedBars(0.5, 50)).toBe(25);
    expect(playedBars(2, 50)).toBe(50);
    expect(playedBars(Number.NaN, 50)).toBe(0);
  });

  it('turns a finger position into a share of the wave', () => {
    expect(shareAt(75, 150)).toBe(0.5);
    expect(shareAt(-10, 150)).toBe(0);
    expect(shareAt(10, 0)).toBe(0);
  });

  it('counts tenths for the scrub haptic', () => {
    expect(tenthOf(0.05)).toBe(0);
    expect(tenthOf(0.15)).toBe(1);
    expect(tenthOf(1)).toBe(9);
  });
});
