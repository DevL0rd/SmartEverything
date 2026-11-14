import { useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { ScrollView, View, type TextInput } from 'react-native';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { useSyncStatus } from '../../../store/selectors';
import { isSearching, type SearchInput } from './query';
import { usePhotoRecentSearches, type RecentSearch } from './recent';
import {
  initialSearch,
  isTyping,
  queryInputOf,
  searchReducer,
  type SearchAction,
  type SearchState,
} from './search-state';
import { hasStart, SearchStart } from './start';
import { flatSuggestions, suggestionsOf, type SuggestionGroup } from './suggest';
import { Suggestions } from './suggestions';
import { TokenField, UNUSED_NOTE } from './token-field';
import { tokenKey, type SearchToken } from './tokens';
import { tryChipsOf, type TryChip } from './try-chips';
import { useSearchSources } from './use-search-sources';

const NOTED: ReadonlySet<SearchAction['type']> = new Set(['pick', 'commit', 'apply']);

const CLOSING: ReadonlySet<SearchAction['type']> = new Set(['pick', 'commit', 'apply', 'clear']);

const LOADING_GROUPS = ['places', 'dates', 'albums', 'cameras'] as const;

export interface LibrarySearch {
  readonly state: SearchState;
  readonly input: SearchInput;
  readonly groups: readonly SuggestionGroup[];
  readonly highlight: number;
  readonly loading: boolean;
  readonly offline: boolean;
  readonly recent: readonly RecentSearch[];
  readonly chips: readonly TryChip[];
  readonly open: boolean;
  readonly act: (action: SearchAction) => void;
  readonly submit: () => void;
  readonly key: (key: string) => void;
  readonly browse: () => void;
  readonly close: () => void;
  readonly clearRecent: () => void;
}

function stepOf(key: string): number {
  if (key === 'ArrowDown') return 1;
  return key === 'ArrowUp' ? -1 : 0;
}

export function panelOpenOf(
  state: SearchState,
  browsing: boolean,
  start: boolean,
  offline: boolean,
): boolean {
  if (isTyping(state)) return true;
  return browsing && (start || offline);
}

interface SuggestionView {
  readonly groups: readonly SuggestionGroup[];
  readonly loading: boolean;
  readonly chips: readonly TryChip[];
}

function useSuggestionGroups(state: SearchState, offline: boolean): SuggestionView {
  const { sources, loading } = useSearchSources();
  const groups = useMemo(
    () => (isTyping(state) && !offline ? suggestionsOf(state.input, sources, state.tokens) : []),
    [state, sources, offline],
  );
  const chips = useMemo(() => tryChipsOf(sources), [sources]);
  return { groups, loading, chips };
}

export function useLibrarySearch(q: string): LibrarySearch {
  const [state, dispatch] = useReducer(searchReducer, q, initialSearch);
  const [browsing, setBrowsing] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const status = useSyncStatus().status;
  const offline = status === 'interrupted' || status === 'refused';
  const recent = usePhotoRecentSearches();
  const { groups, loading, chips } = useSuggestionGroups(state, offline);
  const flat = flatSuggestions(groups);
  const act = (action: SearchAction): void => {
    const next = searchReducer(state, action);
    dispatch(action);
    if (action.type === 'type') setHighlight(0);
    if (CLOSING.has(action.type)) setBrowsing(false);
    if (NOTED.has(action.type) && isSearching(queryInputOf(next))) recent.note(queryInputOf(next));
  };
  const close = (): void => {
    setBrowsing(false);
    if (isTyping(state)) dispatch({ type: 'type', value: state.words });
  };
  return {
    state,
    input: queryInputOf(state),
    groups,
    highlight,
    loading,
    offline,
    recent: recent.recent,
    chips,
    open: panelOpenOf(state, browsing, hasStart(chips, recent.recent), offline),
    act,
    submit: (): void => {
      const picked = flat[highlight];
      act(picked === undefined ? { type: 'commit' } : { type: 'pick', token: picked.token });
    },
    key: (pressed): void => {
      if (pressed === 'Escape') close();
      if (pressed === 'Backspace') act({ type: 'backspace' });
      const step = stepOf(pressed);
      if (step !== 0) setHighlight((held) => Math.min(Math.max(held + step, 0), flat.length));
    },
    browse: (): void => {
      setBrowsing(true);
    },
    close,
    clearRecent: recent.clear,
  };
}

export function removeLastOf(search: LibrarySearch): () => void {
  return (): void => {
    const last = search.input.tokens.at(-1);
    if (last !== undefined) search.act({ type: 'remove', token: last });
  };
}

export function unusedNoteOf(tokens: readonly SearchToken[]): string | null {
  if (tokens.length === 0) return null;
  return `${UNUSED_NOTE}: ${tokens.map((token) => token.label).join(', ')}`;
}

export function LibrarySearchBar({
  search,
  unused,
}: {
  readonly search: LibrarySearch;
  readonly unused: readonly SearchToken[];
}): ReactNode {
  const inputRef = useRef<TextInput>(null);
  const { state, act } = search;
  const note = unusedNoteOf(unused);
  return (
    <View className="w-full max-w-reading gap-1">
      <TokenField
        tokens={state.tokens}
        value={state.input}
        inputRef={inputRef}
        unused={new Set(unused.map(tokenKey))}
        onFocus={search.browse}
        onChange={(value) => {
          act({ type: 'type', value });
        }}
        onSubmit={search.submit}
        onKey={search.key}
        onRemove={(token) => {
          act({ type: 'remove', token });
        }}
        onClear={() => {
          act({ type: 'clear' });
        }}
      />
      {note === null ? null : (
        <Text variant="caption" tone="variant" numberOfLines={2}>
          {note}
        </Text>
      )}
    </View>
  );
}

function SuggestionsLoading(): ReactNode {
  return (
    <View
      accessibilityLabel="Loading suggestions"
      className="gap-3 rounded-lg bg-surface-3 p-3 elevation-2"
    >
      {LOADING_GROUPS.map((group) => (
        <View key={group} className="gap-2">
          <Skeleton shape="line" className="h-3 w-20" />
          <Skeleton shape="line" className="h-5 w-full" />
        </View>
      ))}
    </View>
  );
}

function Matches({ search }: { readonly search: LibrarySearch }): ReactNode {
  const { state, act } = search;
  if (!isTyping(state) || search.offline) return null;
  if (search.loading && search.groups.length === 0) return <SuggestionsLoading />;
  return (
    <Suggestions
      groups={search.groups}
      words={state.input}
      highlight={search.highlight}
      onPick={(suggestion) => {
        act({ type: 'pick', token: suggestion.token });
      }}
      onWords={() => {
        act({ type: 'commit' });
      }}
    />
  );
}

export function LibrarySearchPanel({ search }: { readonly search: LibrarySearch }): ReactNode {
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      className="min-h-0 flex-1"
      contentContainerClassName="w-full max-w-reading gap-section-gap pb-section-gap pt-2"
    >
      {search.offline ? (
        <Banner
          tone="info"
          title="The hub is offline"
          body="Recent searches and suggestions still work. New results need your home hub."
          wrapBody
        />
      ) : null}
      <Matches search={search} />
      <SearchStart
        chips={search.chips}
        recent={search.recent}
        onApply={(input) => {
          search.act({ type: 'apply', search: input });
        }}
        onClearRecent={search.clearRecent}
      />
      <View className="flex-row justify-end">
        <Button label="Done" variant="text" onPress={search.close} />
      </View>
    </ScrollView>
  );
}
