import { describe, expect, it } from 'vitest';
import { parse, stringify } from 'yaml';

describe('yaml contract', () => {
  it('writes block style that parses back to the same object', () => {
    const value = { api: { listen: '127.0.0.1:1984' }, ice: [{ urls: 'stun:a' }, { urls: 'b' }] };
    const text = stringify(value, { lineWidth: 0 });
    expect(text.startsWith('api:\n  listen: ')).toBe(true);
    expect(parse(text)).toStrictEqual(value);
  });

  it('omits undefined members instead of writing them', () => {
    expect(parse(stringify({ urls: 'turn:a', username: undefined }))).toStrictEqual({
      urls: 'turn:a',
    });
  });

  it('never wraps a long value across lines when line width is zero', () => {
    const long = 'x'.repeat(300);
    expect(stringify({ key: long }, { lineWidth: 0 })).toBe(`key: ${long}\n`);
  });
});
