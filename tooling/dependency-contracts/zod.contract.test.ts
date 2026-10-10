import { describe, expect, it } from 'vitest';
import { itIsPinnedToItsDeclaredVersion } from './contract-helpers';
import { z } from 'zod';

describe('zod contract', () => {
  itIsPinnedToItsDeclaredVersion('zod');

  it('parses a valid object and returns the typed value', () => {
    const schema = z.object({ name: z.string(), count: z.number() });
    expect(schema.parse({ name: 'a', count: 1 })).toStrictEqual({ name: 'a', count: 1 });
  });

  it('throws on invalid input rather than coercing', () => {
    const schema = z.object({ count: z.number() });
    expect(() => schema.parse({ count: '1' })).toThrow();
  });

  it('reports failure through safeParse without throwing', () => {
    const schema = z.uuid();
    const result = schema.safeParse('not-a-uuid');
    expect(result.success).toBe(false);
  });

  it('names the failing path, which boundary error messages depend on', () => {
    const schema = z.object({ nested: z.object({ value: z.number() }) });
    const result = schema.safeParse({ nested: { value: 'x' } });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toStrictEqual(['nested', 'value']);
    }
  });

  it('strips unknown keys by default', () => {
    const schema = z.object({ known: z.string() });
    expect(schema.parse({ known: 'a', unknown: 'b' })).toStrictEqual({ known: 'a' });
  });

  it('rejects rather than strips when strict', () => {
    const schema = z.object({ known: z.string() }).strict();
    expect(() => schema.parse({ known: 'a', unknown: 'b' })).toThrow();
  });
});
