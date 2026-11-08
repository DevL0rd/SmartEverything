import { describe, expect, it } from 'vitest';

const { deepSeekKeyUsable, deepSeekStatusLine } = await import('./deepseek-row');

describe('DeepSeek provider row', () => {
  it('accepts a pasted key with surrounding space', () => {
    expect(deepSeekKeyUsable('  sk-0123456789abcdef  ')).toBe(true);
  });

  it('refuses an empty key or one with spaces inside', () => {
    expect(deepSeekKeyUsable('   ')).toBe(false);
    expect(deepSeekKeyUsable('sk-01 23')).toBe(false);
  });

  it('says whether DeepSeek models are ready', () => {
    expect(deepSeekStatusLine(true)).toBe('DeepSeek models are ready.');
    expect(deepSeekStatusLine(false)).toBe('Add a key so the assistant can use DeepSeek models.');
  });
});
