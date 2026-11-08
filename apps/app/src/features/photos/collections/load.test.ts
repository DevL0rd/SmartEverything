import { describe, expect, it } from 'vitest';

describe('the collections modules', () => {
  it('load with the real kit', { timeout: 240_000 }, async () => {
    const page = await import('./index');
    const grid = await import('./source-grid');
    const header = await import('./video-header');
    expect(typeof page.CollectionScreen).toBe('function');
    expect(typeof page.SourceScreen).toBe('function');
    expect(typeof grid.SourceGrid).toBe('function');
    expect(typeof header.VideoStatsRow).toBe('function');
  });
});
