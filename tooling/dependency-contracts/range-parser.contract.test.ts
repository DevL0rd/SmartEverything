import parseRange from 'range-parser';
import { describe, expect, it } from 'vitest';

function spans(result: ReturnType<typeof parseRange>): readonly { start: number; end: number }[] {
  return typeof result === 'number' ? [] : [...result];
}

describe('range-parser contract', () => {
  it('reads an open-ended range as bytes from the start to the last byte', () => {
    expect(spans(parseRange(10, 'bytes=4-'))).toStrictEqual([{ start: 4, end: 9 }]);
  });

  it('reads a suffix range as the last bytes', () => {
    expect(spans(parseRange(10, 'bytes=-3'))).toStrictEqual([{ start: 7, end: 9 }]);
  });

  it('reports a range beyond the size as unsatisfiable with -1', () => {
    expect(parseRange(10, 'bytes=20-30')).toBe(-1);
  });

  it('reports a malformed header as -2', () => {
    expect(parseRange(10, 'bytes=abc')).toBe(-2);
  });

  it('keeps several requested ranges separate unless asked to combine them', () => {
    expect(spans(parseRange(10, 'bytes=0-1,3-4'))).toHaveLength(2);
    expect(spans(parseRange(10, 'bytes=0-4,3-6', { combine: true }))).toStrictEqual([
      { start: 0, end: 6 },
    ]);
  });
});
