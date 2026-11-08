import { useDebouncedValue } from '../../../design/use-debounced-value';
import type { ModelPickerProps } from '../data/model-candidates';
import {
  useModelCandidates,
  useNativeModelScope,
  type ModelCandidatesResult,
} from '../data/use-model-candidates';
import { usePickerSession } from './model-search-session';
import {
  useSearchModelPages,
  useSearchMakers,
  type SearchModelPages,
} from './model-search-queries';
import {
  modelSearchQuery,
  type ModelSearchFilters,
  type SearchValidation,
} from './model-search-filters';
import { searchCandidates, type SearchCandidates } from './model-search-candidates';
import type { AiModelSearchSort } from '@smarteverything/domain';
const SEARCH_DELAY_MS = 200;
export interface SearchPickerOptions {
  readonly text: string;
  readonly expanded: boolean;
  readonly filters: ModelSearchFilters;
  readonly sort: AiModelSearchSort;
}
export interface SearchPickerData {
  readonly key: string;
  readonly scoped: boolean;
  readonly sources: ModelCandidatesResult;
  readonly rows: SearchCandidates;
  readonly pages: SearchModelPages;
  readonly validation: SearchValidation;
  readonly makers: NonNullable<ReturnType<typeof useSearchMakers>['data']>;
}
function useGlobalSearch(
  query: Parameters<typeof useSearchModelPages>[0],
  session: ReturnType<typeof usePickerSession>,
  enabled: boolean,
): SearchModelPages {
  const pages = useSearchModelPages(query, session, enabled);
  if (enabled) return pages;
  return {
    ...pages,
    models: [],
    total: null,
    snapshot: null,
    metrics: {},
    updated: false,
    pending: false,
    error: null,
    loading: false,
    more: null,
  };
}

export function useSearchPickerData(
  props: ModelPickerProps,
  options: SearchPickerOptions,
): SearchPickerData {
  const session = usePickerSession();
  const text = useDebouncedValue(options.text.trim(), SEARCH_DELAY_MS);
  const kind = props.kind ?? 'chat';
  const validation = modelSearchQuery(kind, options.text, options.filters, options.sort);
  const debounced = modelSearchQuery(kind, text, options.filters, options.sort);
  const query = debounced.ok ? debounced.query : { kind, sort: options.sort };
  const scoped = useNativeModelScope(props.picked) !== undefined;
  const enabled = options.expanded && validation.ok && debounced.ok;
  const visiblePages = useGlobalSearch(query, session, enabled && !scoped);
  const sources = useModelCandidates({
    props,
    query: '',
    catalogue: visiblePages,
    enabled: false,
  });
  const rows = searchCandidates(sources.candidates, visiblePages.models, query);
  const makers = useSearchMakers(kind, session, options.expanded && !scoped);
  return {
    key: JSON.stringify([session.key, query]),
    scoped,
    sources,
    pages: visiblePages,
    rows: validation.ok ? rows : { ...rows, all: [], nativeCount: 0 },
    validation,
    makers: scoped ? [] : (makers.data ?? []),
  };
}
