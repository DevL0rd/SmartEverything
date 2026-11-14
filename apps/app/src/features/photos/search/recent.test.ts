import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { PhotoRecentSearches } from './recent';

const stored = vi.hoisted(() => new Map<string, readonly string[]>([['photoSearches', []]]));

vi.mock('../../../store/local-prefs', () => ({
  setLocalPref: (key: string, value: readonly string[]): void => {
    stored.set(key, value);
  },
  useLocalPref: (key: string): readonly string[] | undefined => stored.get(key),
}));

const { notedRecent, readRecent, usePhotoRecentSearches } = await import('./recent');

function recentHook(): PhotoRecentSearches {
  const held: { current: PhotoRecentSearches | null } = { current: null };
  function Probe(): ReactNode {
    held.current = usePhotoRecentSearches();
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  if (held.current === null) throw new Error('the recent searches hook did not render');
  return held.current;
}

function savedTitles(): readonly string[] {
  return readRecent(stored.get('photoSearches') ?? []).map((entry) => entry.title);
}

const TOKYO = { tokens: [], text: 'Tokyo night' };
const YEAR = {
  tokens: [{ kind: 'date' as const, from: '2026-01-01', to: '2026-12-31', label: '2026' }],
  text: '',
};

describe('recent photo searches', () => {
  it('keeps the newest first without repeats', () => {
    const list = notedRecent(notedRecent(notedRecent([], TOKYO), YEAR), {
      ...TOKYO,
      text: 'tokyo NIGHT ',
    });
    expect(list.map((entry) => entry.title)).toStrictEqual(['tokyo NIGHT', '2026']);
  });

  it('keeps every distinct search without a cap', () => {
    const many = Array.from({ length: 40 }, (_, index) => ({
      tokens: [],
      text: `q${String(index)}`,
    }));
    const kept = many.reduce<ReturnType<typeof notedRecent>>(
      (list, input) => notedRecent(list, input),
      [],
    );
    expect(kept).toHaveLength(40);
    expect(kept[0]?.title).toBe('q39');
  });

  it('reads saved searches back and skips unreadable ones', () => {
    const saved = [JSON.stringify(YEAR), '{"tokens":[{"kind":"nope"}],"text":""}', 'not json'];
    expect(readRecent(saved).map((entry) => entry.title)).toStrictEqual(['2026']);
  });

  it('notes a search and clears every recent search on request', () => {
    stored.set('photoSearches', [JSON.stringify(YEAR)]);
    recentHook().note(TOKYO);
    expect(savedTitles()).toStrictEqual(['Tokyo night', '2026']);
    recentHook().clear();
    expect(savedTitles()).toStrictEqual([]);
  });
});
