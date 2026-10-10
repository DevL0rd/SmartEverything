import { setLocalPref, useLocalPref } from '../store/local-prefs';

const KEPT = 6;

interface RecentSearches {
  readonly recent: readonly string[];
  readonly note: (query: string) => void;
  readonly clear: () => void;
}

export function useRecentSearches(): RecentSearches {
  const recent = useLocalPref('recentSearches');
  return {
    recent,
    note: (query): void => {
      const trimmed = query.trim();
      if (trimmed === '') {
        return;
      }
      const rest = recent.filter((earlier) => earlier.toLowerCase() !== trimmed.toLowerCase());
      setLocalPref('recentSearches', [trimmed, ...rest].slice(0, KEPT));
    },
    clear: (): void => {
      setLocalPref('recentSearches', []);
    },
  };
}
