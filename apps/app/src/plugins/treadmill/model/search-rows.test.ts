import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SETTING_ROWS } from './search-rows';

const SETTINGS_DIR = join(import.meta.dirname, '..', 'settings');

function anchorsInSettings(): readonly string[] {
  return readdirSync(SETTINGS_DIR)
    .filter((name) => name.endsWith('.tsx'))
    .flatMap((name) => [
      ...readFileSync(join(SETTINGS_DIR, name), 'utf8').matchAll(/id="([a-z-]+)"/g),
    ])
    .map((match) => match[1] ?? '');
}

describe('searching the treadmill settings', () => {
  it('gives every row a unique slug and a title that is not its id', () => {
    const ids = SETTING_ROWS.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const row of SETTING_ROWS) {
      expect(row.id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(row.title).not.toBe(row.id);
    }
  });

  it('points at an anchor that exists on the settings page', () => {
    const anchors = new Set(anchorsInSettings());
    expect(SETTING_ROWS.filter((row) => !anchors.has(row.id)).map((row) => row.id)).toEqual([]);
  });

  it('leaves no anchor on the settings page that search cannot reach', () => {
    const rows = new Set(SETTING_ROWS.map((row) => row.id));
    expect([...new Set(anchorsInSettings())].filter((id) => !rows.has(id))).toEqual([]);
  });
});
