import { describe, expect, it } from 'vitest';
import { sparkChoice } from './live-spark-model';

const points = (count: number): { t: number; v: number }[] =>
  Array.from({ length: count }, (_, index) => ({ t: index, v: index * 2 }));

describe('sparkline source choice', () => {
  it('draws the live ring once it holds two readings', () => {
    expect(sparkChoice(points(2), points(30)).source).toBe('live');
  });

  it('falls back to the 24 hour history while the ring is nearly empty', () => {
    const choice = sparkChoice(points(1), points(30));
    expect(choice.source).toBe('history');
    expect(choice.points).toHaveLength(30);
  });

  it('says there is no data when neither source can draw a line', () => {
    expect(sparkChoice([], undefined).source).toBe('none');
    expect(sparkChoice([], points(1)).source).toBe('none');
  });
});
