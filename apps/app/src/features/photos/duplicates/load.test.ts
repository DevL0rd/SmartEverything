import { describe, expect, it } from 'vitest';

describe('the Duplicates modules', () => {
  it('load with the real kit', async () => {
    const page = await import('./index');
    const group = await import('./duplicate-group');
    const stats = await import('./duplicate-stats');
    expect(typeof page.DuplicatesScreen).toBe('function');
    expect(typeof group.DuplicateGroupCard).toBe('function');
    expect(typeof stats.DuplicateStatsRow).toBe('function');
  });
});
