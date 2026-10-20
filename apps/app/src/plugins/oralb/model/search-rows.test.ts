import { describe, expect, it } from 'vitest';
import { ALL_SEARCH_ROWS, searchRowsOf } from '../../toothbrush/model/search-index';
import { ORALB_KEYWORDS, ORALB_ROWS } from './search-rows';

describe('the Oral-B search rows', () => {
  it('has a unique id and title for every row', () => {
    expect(new Set(ORALB_ROWS.map((row) => row.id)).size).toBe(ORALB_ROWS.length);
    expect(new Set(ORALB_ROWS.map((row) => row.title)).size).toBe(ORALB_ROWS.length);
  });

  it('does not reuse an id of any other row in the page', () => {
    const ids = ALL_SEARCH_ROWS.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers every setting, section and action of the Oral-B settings', () => {
    const ids = new Set(ORALB_ROWS.map((row) => row.id));
    for (const id of [
      'oralb-live',
      'oralb-live-broadcast',
      'oralb-live-connected',
      'oralb-head-alerts',
      'oralb-head-warn',
      'oralb-head-due',
      'oralb-on-handle',
      'oralb-pacer',
      'oralb-quarter',
      'oralb-modes',
      'oralb-ring',
      'oralb-head',
      'oralb-consent',
      'oralb-rerun-setup',
      'oralb-look',
      'oralb-handle-colour',
    ]) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it('is reached from the toothbrush words', () => {
    expect(ORALB_KEYWORDS).toEqual(
      expect.arrayContaining(['oral-b', 'oralb', 'io', 'smartring', 'pacer', 'quadrant']),
    );
    expect(searchRowsOf('oralb').some((row) => row.id === 'oralb-pacer')).toBe(true);
    expect(searchRowsOf('sonicare').some((row) => row.id === 'oralb-pacer')).toBe(false);
  });
});
