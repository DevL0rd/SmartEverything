import { describe, expect, it } from 'vitest';
import { reportOf, statusOf } from './robot-fixture';

const { linesFor, statusLines } = await import('./aibi-bodies');

const NOW = Date.parse('2026-10-18T10:05:00Z');

describe('AIBI widget bodies', () => {
  it('lists when AIBI was last heard from before its firmware', () => {
    const lines = statusLines(statusOf({ robot: reportOf() }), NOW);
    expect(lines.map((line) => line.key)).toStrictEqual(['heard', 'firmware']);
    expect(lines[0]?.text.startsWith('Last heard from ')).toBe(true);
    expect(lines[1]?.text).toBe('Firmware 1.7.0');
  });

  it('leaves the firmware line out until the robot reports one', () => {
    const lines = statusLines(statusOf({ robot: null, contact: null }), NOW);
    expect(lines).toStrictEqual([{ key: 'heard', text: 'Last heard from Never' }]);
  });

  it('wraps a line to every whole line the measured room holds and never below one', () => {
    expect(linesFor(54, 18)).toBe(3);
    expect(linesFor(10, 18)).toBe(1);
    expect(linesFor(null, 18)).toBeUndefined();
  });
});
