import { describe, expect, it } from 'vitest';

describe('the settings registry', () => {
  it('loads every setting and finds the layouts page setting', async () => {
    const { settingPageOf } = await import('./registry');
    expect(settingPageOf('home.layouts')).toBe('home/layouts');
  });
});
