import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALL_SEARCH_ROWS as SETTING_ROWS, searchRowsOf } from './search-index';

const FOLDERS = [
  new URL('../settings/', import.meta.url),
  new URL('../../sonicare/settings/', import.meta.url),
  new URL('../../oralb/settings/', import.meta.url),
];

function anchoredIds(): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const folder of FOLDERS) {
    for (const file of readdirSync(folder)) {
      if (!file.endsWith('.tsx')) {
        continue;
      }
      const text = readFileSync(new URL(file, folder), 'utf8');
      for (const match of text.matchAll(/\bid(?:=|: )["']([a-z-]+)["']/g)) {
        if (match[1] !== undefined) {
          ids.add(match[1]);
        }
      }
    }
  }
  return ids;
}

describe('searchable settings of the toothbrush', () => {
  it('gives every row its own id and title', () => {
    expect(new Set(SETTING_ROWS.map((row) => row.id)).size).toBe(SETTING_ROWS.length);
    expect(new Set(SETTING_ROWS.map((row) => row.title)).size).toBe(SETTING_ROWS.length);
  });

  it('points every row at a setting that is drawn on the page', () => {
    const drawn = anchoredIds();
    for (const row of SETTING_ROWS) {
      expect(drawn.has(row.id), row.id).toBe(true);
    }
  });

  it('finds every setting that is drawn on the page', () => {
    const rows = new Set(SETTING_ROWS.map((row) => row.id));
    for (const id of anchoredIds()) {
      expect(rows.has(id), id).toBe(true);
    }
  });

  it('offers an Oral-B brush only the settings its page draws', () => {
    const ids = searchRowsOf('oralb').map((row) => row.id);
    expect(ids).toContain('link');
    expect(ids).toContain('diagnostics');
    expect(ids).not.toContain('handle-consent');
    expect(ids).not.toContain('philips-app');
    expect(ids).not.toContain('model');
  });

  it('offers a Sonicare every setting it had', () => {
    const ids = searchRowsOf('sonicare').map((row) => row.id);
    expect(ids).toEqual(expect.arrayContaining(['handle-consent', 'sensor-pressure', 'model']));
  });
});
