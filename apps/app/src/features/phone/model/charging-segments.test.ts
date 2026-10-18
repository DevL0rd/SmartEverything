import { describe, expect, it } from 'vitest';
import { chargingSegmentsOf, chargingSummary } from './charging-segments';

describe('charging segments', () => {
  it('fills the gaps between charging spans with on battery', () => {
    expect(chargingSegmentsOf([{ start: 20, end: 40 }], 0, 100)).toEqual([
      { start: 0, end: 20, state: 'battery' },
      { start: 20, end: 40, state: 'charging' },
      { start: 40, end: 100, state: 'battery' },
    ]);
  });

  it('clips spans to the window and ignores spans outside it', () => {
    expect(
      chargingSegmentsOf(
        [
          { start: -50, end: 10 },
          { start: 200, end: 300 },
        ],
        0,
        100,
      ),
    ).toEqual([
      { start: 0, end: 10, state: 'charging' },
      { start: 10, end: 100, state: 'battery' },
    ]);
  });

  it('is one on battery segment without any span', () => {
    expect(chargingSegmentsOf([], 0, 100)).toEqual([{ start: 0, end: 100, state: 'battery' }]);
  });

  it('summarises for screen readers', () => {
    expect(chargingSummary([])).toBe('Charging: not charged in this period');
    expect(chargingSummary([{ start: Date.parse('2026-10-18T10:00:00.000Z'), end: 1 }])).toContain(
      '1 time',
    );
  });
});
