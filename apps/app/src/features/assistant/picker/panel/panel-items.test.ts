import { describe, expect, it } from 'vitest';
import type { ModelCandidate } from '../../data/model-candidates';
import type { LibraryRow } from '../library/library-rows';
import type { ModelChoice } from '../model-choice';
import {
  FAVOURITES_HINT,
  SEARCH_MAX,
  SUGGESTED_BELOW,
  SUGGESTED_MAX,
  idleEntries,
  keyboardItems,
  libraryMoreTitle,
  rowEntries,
  searchEntries,
  searchRows,
  type PanelEntry,
} from './panel-items';

const MACHINE = 'device:studio';

function model(key: string, name = key): ModelChoice {
  return {
    id: key,
    name,
    provider: 'anthropic',
    providerLabel: 'Anthropic',
    contextLength: null,
    price: { inputPerMillion: null, outputPerMillion: null, variable: false },
    efforts: [],
    latest: false,
    inputs: [],
    outputs: [],
  };
}

function row(key: string, flags: Partial<ModelCandidate> = {}, sources = [MACHINE]): LibraryRow {
  const candidate: ModelCandidate = {
    key,
    model: model(key),
    selected: false,
    favourite: false,
    pick: null,
    render: (): null => null,
    ...flags,
  };
  return { key, candidate, sources, where: null, reason: null, favouriteId: key };
}

const titles = (entries: readonly PanelEntry[]): string[] =>
  entries.flatMap((entry) => (entry.type === 'header' ? [entry.title] : []));

const idle = (rows: readonly LibraryRow[], recent: readonly string[] = []): readonly PanelEntry[] =>
  idleEntries({ rows, recent, machineId: MACHINE, machineName: 'Studio' });

describe('the idle model panel sections', () => {
  it('lists Current, Favourites, Recent and Suggested in that order', () => {
    const entries = idle(
      [row('c', { selected: true }), row('f', { favourite: true }), row('r'), row('s')],
      ['r'],
    );
    expect(titles(entries)).toEqual(['Current', 'Favourites', 'Recent', 'Suggested for Studio']);
  });

  it('keeps the current and starred models out of Recent', () => {
    const entries = idle([row('c', { selected: true }), row('f', { favourite: true })], ['c', 'f']);
    expect(titles(entries)).not.toContain('Recent');
  });

  it('orders Recent by the saved list, newest first', () => {
    const entries = idle([row('a'), row('b'), row('c')], ['c', 'a']);
    const recent = entries.filter(
      (entry) => entry.key.startsWith('recent:') && entry.type === 'row',
    );
    expect(recent.map((entry) => entry.key)).toEqual(['recent:c', 'recent:a']);
  });

  it('ignores recent ids that no model offers any more', () => {
    expect(titles(idle([row('a')], ['gone']))).not.toContain('Recent');
  });

  it('shows a hint instead of rows when nothing is starred', () => {
    const entries = idle([row('s')]);
    expect(entries.some((entry) => entry.type === 'hint' && entry.text === FAVOURITES_HINT)).toBe(
      true,
    );
  });

  it('suggests only models the current machine offers, up to the cap', () => {
    const many = Array.from({ length: SUGGESTED_MAX + 4 }, (_, index) => row(`s${String(index)}`));
    const elsewhere = row('other', {}, ['server']);
    const entries = idle([...many, elsewhere]);
    const suggested = entries.filter((entry) => entry.key.startsWith('suggested:s'));
    expect(suggested).toHaveLength(SUGGESTED_MAX);
    expect(entries.some((entry) => entry.key === 'suggested:other')).toBe(false);
  });

  it('drops Suggested once Favourites and Recent fill the list', () => {
    const starred = Array.from({ length: SUGGESTED_BELOW }, (_, index) =>
      row(`f${String(index)}`, { favourite: true }),
    );
    expect(titles(idle([...starred, row('s')]))).not.toContain('Suggested for Studio');
  });

  it('shows each model once', () => {
    const entries = idle([row('s'), row('s')]);
    expect(entries.filter((entry) => entry.key === 'suggested:s')).toHaveLength(1);
  });

  it('has no Suggested section for an unknown machine', () => {
    const entries = idleEntries({
      rows: [row('s')],
      recent: [],
      machineId: MACHINE,
      machineName: null,
    });
    expect(titles(entries)).toEqual(['Favourites']);
  });
});

describe('the model panel search results', () => {
  it('groups rows under the machine that offers them, in first-seen order', () => {
    const entries = searchEntries({
      rows: [row('a', {}, ['server']), row('b', {}, [MACHINE]), row('c', {}, ['server'])],
      groupName: (id) => (id === 'server' ? 'Home Hub · OpenRouter' : 'Studio'),
    });
    expect(titles(entries)).toEqual(['On Home Hub · OpenRouter', 'On Studio']);
    expect(rowEntries(entries).map((entry) => entry.key)).toEqual(['a', 'c', 'b']);
  });

  it('shows at most the search cap of rows', () => {
    const rows = Array.from({ length: SEARCH_MAX + 5 }, (_, index) => row(`m${String(index)}`));
    expect(rowEntries(searchEntries({ rows, groupName: (id) => id }))).toHaveLength(SEARCH_MAX);
  });

  it('puts rows no machine offers under Not available', () => {
    const entries = searchEntries({ rows: [row('a', {}, [])], groupName: (id) => id });
    expect(titles(entries)).toEqual(['Not available']);
  });

  it('matches local models on the typed words before the catalogue answers', () => {
    const rows = searchRows(
      [row('claude-sonnet'), row('gemini-flash')],
      [row('catalogue-only')],
      'claude son',
    );
    expect(rows.map((entry) => entry.key)).toEqual(['claude-sonnet', 'catalogue-only']);
  });
});

describe('the way on to the full library', () => {
  it('names the total when the catalogue has answered and more exists', () => {
    expect(libraryMoreTitle({ total: 120, shown: SEARCH_MAX, searching: true })).toBe(
      'Show all 120 in the library',
    );
    expect(libraryMoreTitle({ total: 12, shown: 12, searching: true })).toBeNull();
  });

  it('still offers the library when search rows were cut before the catalogue answered', () => {
    expect(libraryMoreTitle({ total: null, shown: SEARCH_MAX, searching: true })).toBe(
      'Show all in the library',
    );
    expect(libraryMoreTitle({ total: null, shown: 3, searching: true })).toBeNull();
    expect(libraryMoreTitle({ total: null, shown: SEARCH_MAX, searching: false })).toBeNull();
  });
});

describe('keyboardItems', () => {
  const rows = [row('a'), row('b', { pick: null })];
  const facts = { rows, blocked: false, searching: false, hasThinking: true };

  it('lists machine, thinking and rows when idle', () => {
    expect(keyboardItems(facts).map((item) => item.id)).toEqual(['machine', 'thinking', 'a', 'b']);
  });

  it('omits the thinking stop when the model has no thinking levels', () => {
    expect(keyboardItems({ ...facts, hasThinking: false }).map((item) => item.id)).toEqual([
      'machine',
      'a',
      'b',
    ]);
  });

  it('lists only rows while searching', () => {
    expect(keyboardItems({ ...facts, searching: true }).map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('disables thinking when blocked', () => {
    expect(keyboardItems({ ...facts, blocked: true })[1]).toEqual({
      id: 'thinking',
      disabled: true,
    });
  });
});
