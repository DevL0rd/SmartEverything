import { describe, expect, it } from 'vitest';
import { piUsageChunk } from '../src/providers/pi-usage';

describe('pi-ai usage chunks', () => {
  it('restores the zero cache read that pi-ai leaves out', () => {
    expect(piUsageChunk({ type: 'usage', usage: { inputTokens: 900, outputTokens: 20 } })).toEqual({
      type: 'usage',
      usage: { inputTokens: 900, outputTokens: 20, cacheReadTokens: 0 },
    });
  });

  it('keeps a reported cache read and other chunks as they are', () => {
    const usage = {
      type: 'usage',
      usage: { inputTokens: 80, outputTokens: 20, cacheReadTokens: 820 },
    } as const;
    expect(piUsageChunk(usage)).toBe(usage);
    const text = { type: 'text-delta', index: 0, text: 'hi' } as const;
    expect(piUsageChunk(text)).toBe(text);
  });
});
