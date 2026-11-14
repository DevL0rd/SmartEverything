import { useMemo } from 'react';
import { z } from 'zod';
import { Logger } from '@smarteverything/logging';
import { jsonText } from '../../../format/json-text';
import { setLocalPref, useLocalPref } from '../../../store/local-prefs';
import { searchKeyOf, type SearchInput } from './query';
import { SEARCH_TOKEN, searchTitleOf } from './tokens';

const log = new Logger('app.photos');

const RECENT = z
  .strictObject({ tokens: z.array(SEARCH_TOKEN).readonly(), text: z.string() })
  .readonly();

export interface RecentSearch extends SearchInput {
  readonly key: string;
  readonly title: string;
}

function recentOf(input: SearchInput): RecentSearch {
  return {
    tokens: input.tokens,
    text: input.text.trim(),
    key: searchKeyOf(input),
    title: searchTitleOf(input.tokens, input.text),
  };
}

export function readRecent(stored: readonly string[]): readonly RecentSearch[] {
  return stored.flatMap((entry) => {
    const read = jsonText(entry);
    const parsed = read.ok ? RECENT.safeParse(read.value) : null;
    if (parsed?.success !== true) {
      log.warn('recent.unreadable', { length: entry.length });
      return [];
    }
    return [recentOf(parsed.data)];
  });
}

function storedOf(list: readonly RecentSearch[]): readonly string[] {
  return list.map((entry) => JSON.stringify({ tokens: entry.tokens, text: entry.text }));
}

export function notedRecent(
  list: readonly RecentSearch[],
  input: SearchInput,
): readonly RecentSearch[] {
  const entry = recentOf(input);
  const rest = list.filter((earlier) => earlier.key !== entry.key);
  return [entry, ...rest];
}

export interface PhotoRecentSearches {
  readonly recent: readonly RecentSearch[];
  readonly note: (input: SearchInput) => void;
  readonly clear: () => void;
}

export function usePhotoRecentSearches(): PhotoRecentSearches {
  const stored = useLocalPref('photoSearches');
  const recent = useMemo(() => readRecent(stored), [stored]);
  return {
    recent,
    note: (input): void => {
      if (input.tokens.length === 0 && input.text.trim() === '') return;
      setLocalPref('photoSearches', [...storedOf(notedRecent(recent, input))]);
    },
    clear: (): void => {
      setLocalPref('photoSearches', []);
    },
  };
}
