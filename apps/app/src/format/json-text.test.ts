import { describe, expect, it } from 'vitest';
import { jsonText } from './json-text';

describe('reading JSON text', () => {
  it('gives the parsed value', () => {
    expect(jsonText('{"a":[1,true,null]}')).toEqual({ ok: true, value: { a: [1, true, null] } });
  });

  it('names why text is not JSON instead of throwing', () => {
    const read = jsonText('not json');
    expect(read.ok).toBe(false);
    expect(read.ok ? '' : read.reason).toMatch(/JSON/);
  });
});
