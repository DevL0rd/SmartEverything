import { describe, expect, it } from 'vitest';
import type { SearchEntry, SearchIndex } from '@smarteverything/domain';
import { matchIndex } from './match';

function entry(id: string, title: string, keywords: string[] = []): SearchEntry {
  return {
    id,
    group: 'device',
    title,
    detail: '',
    keywords,
    state: null,
    openLabel: 'Open',
    suggested: false,
    open: { kind: 'room', roomId: 'r' },
    run: null,
    runLabel: null,
  };
}

const INDEX: SearchIndex = {
  entries: [
    entry('a', 'Bedside lamp', ['light']),
    entry('b', 'Wi-Fi router'),
    entry('c', 'Kitchen fan'),
  ],
  numbers: [],
};

describe('matchIndex', () => {
  it('finds entries by title prefix and keyword', () => {
    expect([...matchIndex(INDEX, 'bed').hits.keys()]).toEqual(['a']);
    expect([...matchIndex(INDEX, 'light').hits.keys()]).toEqual(['a']);
  });

  it('matches hyphenated titles without the hyphen', () => {
    expect(matchIndex(INDEX, 'wifi').hits.has('b')).toBe(true);
  });

  it('returns the same hits when the index is queried again', () => {
    const first = matchIndex(INDEX, 'kitchen fan');
    const second = matchIndex(INDEX, 'kitchen fan');
    expect([...second.hits.entries()]).toEqual([...first.hits.entries()]);
    expect(second.hits.get('c')?.entry).toBe(INDEX.entries[2]);
  });
});
