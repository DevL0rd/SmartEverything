import { describe, expect, it, vi } from 'vitest';

vi.mock('../data/readiness', () => ({ useReadiness: (): null => null }));
vi.mock('../data/today', () => ({ useTodayContext: (): unknown => ({ day: '2026-10-10' }) }));

const { reasonsThatFit } = await import('./readiness-widget');

describe('reasonsThatFit', () => {
  it('lists the reasons whose lines fit under the readiness word', () => {
    expect(reasonsThatFit({ width: 348, height: 140, idiom: 'touch' }, 1, 4)).toBe(3);
    expect(reasonsThatFit({ width: 348, height: 120, idiom: 'pointer' }, 1, 4)).toBe(3);
  });

  it('lists every reason when two columns hold them', () => {
    expect(reasonsThatFit({ width: 640, height: 120, idiom: 'pointer' }, 2, 4)).toBe(4);
  });

  it('never lists more reasons than the score has', () => {
    expect(reasonsThatFit({ width: 348, height: 324, idiom: 'touch' }, 1, 2)).toBe(2);
  });
});
