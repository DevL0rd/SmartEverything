import { describe, expect, it } from 'vitest';
import { BOTTLE_WORDS, SETTING_ROWS } from './search-rows';

describe('bottle search rows', () => {
  it('gives every row a unique id and a title people can search for', () => {
    const ids = SETTING_ROWS.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(SETTING_ROWS.every((row) => row.title.length > 3)).toBe(true);
  });

  it('covers the settings on the page and the words people use', () => {
    const ids = SETTING_ROWS.map((row) => row.id);
    for (const id of [
      'person',
      'body',
      'filter',
      'reminders',
      'quiet-hours',
      'calibration',
      'diagnostics',
      'forget',
    ]) {
      expect(ids).toContain(id);
    }
    expect(BOTTLE_WORDS).toContain('LARQ');
    expect(BOTTLE_WORDS).toContain('hydration');
  });
});
