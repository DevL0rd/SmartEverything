import { describe, expect, it } from 'vitest';
import { barRemainder, barTotal, segmentBarSummary, type BarSegment } from './segment-bar';

const KINDS: readonly BarSegment[] = [
  { label: 'Images', value: 3, colour: 'viz-1' },
  { label: 'Videos', value: 1, colour: 'viz-3' },
];

const terabytes = (value: number): string => `${String(value)} TB`;

describe('segment bar total', () => {
  it('uses the given total so the rest of the track shows the free part', () => {
    expect(barTotal(KINDS, 8)).toBe(8);
    expect(barRemainder(KINDS, 8)).toBe(4);
  });

  it('never draws a total smaller than its parts, and ignores negative parts', () => {
    expect(barTotal(KINDS, 2)).toBe(4);
    expect(barRemainder(KINDS, 2)).toBe(0);
    expect(barTotal([...KINDS, { label: 'Odd', value: -5, colour: 'track' }], undefined)).toBe(4);
  });
});

describe('segment bar text alternative', () => {
  it('reads every part with its value and the total when a format is given', () => {
    expect(segmentBarSummary('Storage', KINDS, 8, terabytes)).toBe(
      'Storage: Images 3 TB, Videos 1 TB of 8 TB',
    );
  });

  it('reads every part as its share of the bar without a format', () => {
    expect(segmentBarSummary('Kinds', KINDS, undefined, undefined)).toBe(
      'Kinds: Images 75 %, Videos 25 %',
    );
  });
});
