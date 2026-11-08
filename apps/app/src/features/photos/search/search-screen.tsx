import type { Dispatch, ReactElement, ReactNode } from 'react';
import { useMemo, useReducer, useRef, useState } from 'react';
import { ScrollView, View, type TextInput } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Banner } from '../../../components/banner';
import { EmptyState } from '../../../components/empty-state';
import type { MediaZoomStep } from '../../../components/media-grid/justify';
import {
  useMediaSelection,
  type MediaSelectionControls,
} from '../../../components/media-grid/selection';
import { useFocusOnMount } from '../../../components/use-focus-on-mount';
import { useAreaWidth } from '../../../design/size-class';
import { useScopeVisible } from '../../../design/visibility';
import { useSyncStatus } from '../../../store/selectors';
import { libraryLayoutOf } from '../../nas/frame/sections';
import { PhotosFrame } from '../components/photos-frame';
import {
  TimelineActionRow,
  TimelineSelection,
  TimelineSelectionHead,
  type TimelineSelectionProps,
} from '../timeline/timeline-selection';
import { useMediaActions, type MediaActions } from '../timeline/use-media-actions';
import { isSearching, type SearchInput } from './query';
import { usePhotoRecentSearches } from './recent';
import { SearchResults } from './results-view';
import {
  initialSearch,
  isTyping,
  queryInputOf,
  searchMoved,
  searchReducer,
  type SearchAction,
  type SearchState,
} from './search-state';
import { SearchStart } from './start';
import { flatSuggestions, suggestionsOf, type SuggestionGroup } from './suggest';
import { Suggestions } from './suggestions';
import { TokenField } from './token-field';
import { tryChipsOf } from './try-chips';
import { useSearchPages, type SearchPages } from './use-search-pages';
import { useSearchSources } from './use-search-sources';

const NOTED: ReadonlySet<SearchAction['type']> = new Set(['pick', 'commit', 'apply']);

interface Controller {
  readonly state: SearchState;
  readonly groups: readonly SuggestionGroup[];
  readonly highlight: number;
  readonly act: (action: SearchAction) => void;
  readonly key: (key: string) => void;
  readonly submit: () => void;
}

function stepOf(key: string): number {
  if (key === 'ArrowDown') return 1;
  return key === 'ArrowUp' ? -1 : 0;
}

function useController(
  state: SearchState,
  dispatch: Dispatch<SearchAction>,
  onMoved: () => void,
): Controller {
  const [highlight, setHighlight] = useState(0);
  const recent = usePhotoRecentSearches();
  const sources = useSearchSources();
  const groups = useMemo(
    () => (isTyping(state) ? suggestionsOf(state.input, sources, state.tokens) : []),
    [state, sources],
  );
  const flat = flatSuggestions(groups);
  const act = (action: SearchAction): void => {
    const next = searchReducer(state, action);
    dispatch(action);
    if (searchMoved(state, next)) onMoved();
    if (action.type === 'type') setHighlight(0);
    if (NOTED.has(action.type) && isSearching(queryInputOf(next))) {
      recent.note(queryInputOf(next));
    }
  };
  const submit = (): void => {
    const picked = flat[highlight];
    act(picked === undefined ? { type: 'commit' } : { type: 'pick', token: picked.token });
  };
  const key = (pressed: string): void => {
    if (pressed === 'Backspace') act({ type: 'backspace' });
    const step = stepOf(pressed);
    if (step !== 0) setHighlight((held) => Math.min(Math.max(held + step, 0), flat.length));
  };
  return { state, groups, highlight, act, key, submit };
}

function Start({ onApply }: { readonly onApply: (search: SearchInput) => void }): ReactNode {
  const recent = usePhotoRecentSearches();
  const sources = useSearchSources();
  const chips = useMemo(() => tryChipsOf(sources), [sources]);
  if (chips.length === 0 && recent.recent.length === 0) {
    return (
      <EmptyState
        icon="search"
        title="Search your photos"
        body="Type a place, a date like last summer, an album, a camera or words from a file name."
      />
    );
  }
  return (
    <SearchStart chips={chips} recent={recent.recent} onApply={onApply} onForget={recent.remove} />
  );
}

interface Results {
  readonly pages: SearchPages;
  readonly step: MediaZoomStep;
  readonly onStep: (step: MediaZoomStep) => void;
  readonly controls: MediaSelectionControls;
  readonly media: MediaActions;
}

function Body({
  controller,
  results,
}: {
  readonly controller: Controller;
  readonly results: Results;
}): ReactNode {
  const { state, act } = controller;
  const apply = (search: SearchInput): void => {
    act({ type: 'apply', search });
  };
  if (isTyping(state)) {
    return (
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-section-gap">
        <Suggestions
          groups={controller.groups}
          words={state.input}
          highlight={controller.highlight}
          onPick={(suggestion) => {
            act({ type: 'pick', token: suggestion.token });
          }}
          onWords={() => {
            act({ type: 'commit' });
          }}
        />
        <Start onApply={apply} />
      </ScrollView>
    );
  }
  const search = queryInputOf(state);
  if (!isSearching(search)) {
    return (
      <ScrollView keyboardShouldPersistTaps="handled">
        <Start onApply={apply} />
      </ScrollView>
    );
  }
  return (
    <SearchResults
      search={search}
      {...results}
      onClearFilters={() => {
        act({ type: 'apply', search: { tokens: [], text: search.text } });
      }}
    />
  );
}

function OfflineBanner(): ReactNode {
  return (
    <Banner
      tone="info"
      title="Offline · showing earlier results"
      body="New searches need your home hub."
      wrapBody
    />
  );
}

function selectionHeadOf(compact: boolean, props: TimelineSelectionProps): ReactElement | null {
  if (!props.controls.selection.active) return null;
  return compact ? <TimelineSelectionHead {...props} /> : <TimelineSelection {...props} />;
}

function useResults(state: SearchState): Results {
  const visible = useScopeVisible();
  const search = queryInputOf(state);
  const pages = useSearchPages(search, visible && isSearching(search));
  const controls = useMediaSelection(pages.ids);
  const media = useMediaActions();
  const [step, setStep] = useState<MediaZoomStep>('days');
  return { pages, step, onStep: setStep, controls, media };
}

export function PhotosSearchScreen(): ReactNode {
  const params = useLocalSearchParams<{ q?: string }>();
  const [state, dispatch] = useReducer(searchReducer, params.q ?? '', initialSearch);
  const results = useResults(state);
  const controller = useController(state, dispatch, results.controls.clear);
  const compact = libraryLayoutOf(useAreaWidth()) === 'compact';
  const inputRef = useRef<TextInput>(null);
  const live = useSyncStatus().status === 'live';
  useFocusOnMount(true, inputRef);
  const { act } = controller;
  const selection: TimelineSelectionProps = {
    controls: results.controls,
    tiles: results.pages.tiles,
    media: results.media,
  };
  return (
    <PhotosFrame
      search={false}
      active="search"
      subtitle="Places, dates, albums and cameras"
      scroll={false}
      selection={selectionHeadOf(compact, selection)}
      {...(live ? {} : { banner: <OfflineBanner /> })}
    >
      <View className="min-h-0 flex-1 gap-3">
        <TokenField
          tokens={state.tokens}
          value={state.input}
          inputRef={inputRef}
          onChange={(value) => {
            act({ type: 'type', value });
          }}
          onSubmit={controller.submit}
          onKey={controller.key}
          onRemove={(token) => {
            act({ type: 'remove', token });
          }}
          onClear={() => {
            act({ type: 'clear' });
          }}
        />
        <Body controller={controller} results={results} />
        {results.controls.selection.active && compact ? <TimelineActionRow {...selection} /> : null}
      </View>
    </PhotosFrame>
  );
}
