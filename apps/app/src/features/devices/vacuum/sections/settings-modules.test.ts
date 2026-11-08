import { describe, expect, it } from 'vitest';

describe('settings modules', () => {
  it('load without a browser or a device', async () => {
    const settings = await import('./settings');
    const items = await import('../search-items');
    expect(typeof settings.VacuumSettings).toBe('function');
    expect(items.VACUUM_SEARCH_ITEMS.length).toBeGreaterThan(20);
  });
});
