import { describe, expect, it } from 'vitest';
import { minorOf } from './helper.ts';
import { shapeOf, stampNow, summary } from './summary.ts';

describe('summary', () => {
  it('takes the median per workload and kind', () => {
    const lines = [
      { workload: 'untar', kind: 'nfs', seconds: 5 },
      { workload: 'untar', kind: 'nfs', seconds: 3 },
      { workload: 'untar', kind: 'nfs', seconds: 4 },
      { workload: 'untar', kind: 'se-mb64', seconds: 2 },
      { workload: 'untar', kind: 'se-mb64', seconds: 4 },
    ]
      .map((line) => JSON.stringify(line))
      .join('\n');
    const medians = summary(`${lines}\n`);
    expect(medians.get('untar')?.get('nfs')).toBe(4);
    expect(medians.get('untar')?.get('se-mb64')).toBe(3);
  });

  it('refuses a line that is not a result', () => {
    expect(() => summary('{"nothing":1}\n')).toThrow();
  });
});

describe('stampNow', () => {
  it('formats the date and minute', () => {
    expect(stampNow(new Date('2026-01-02T03:04:05Z'))).toBe('20260102-0304');
  });
});

describe('minorOf', () => {
  it('decodes a small device number', () => {
    expect(minorOf(45)).toBe(45);
  });

  it('decodes a minor above 255', () => {
    expect((300 & 0xff) | (256 << 12)).toBe(1048620);
    expect(minorOf(1048620)).toBe(300);
  });
});

describe('shapeOf', () => {
  it('reads kinds, runs and the sweep from a results file', () => {
    const lines = [
      { workload: 'untar', kind: 'nfs', run: 1, seconds: 1 },
      { workload: 'untar', kind: 'se', run: 1, seconds: 1 },
      { workload: 'untar', kind: 'nfs', run: 2, seconds: 1 },
      { workload: 'untar', kind: 'se-mb64', run: 3, seconds: 1 },
    ]
      .map((line) => JSON.stringify(line))
      .join('\n');
    expect(shapeOf(lines)).toEqual({ kinds: ['se', 'nfs'], runs: 2, sweep: true });
  });
});
