import { useDebouncedValue } from '../../../design/use-debounced-value';
import type { ModelPickerProps } from '../data/model-candidates';
import { useModelCandidates, type ModelCandidatesResult } from '../data/use-model-candidates';
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
  readonly sources: ModelCandidatesResult;
  readonly rows: SearchCandidates;
  readonly pages: SearchModelPages;
  readonly validation: SearchValidation;
  readonly makers: ReturnType<typeof useSearchMakers>;
}
export function useSearchPickerData(
  props: ModelPickerProps,
  options: SearchPickerOptions,
): SearchPickerData {
  const session = usePickerSession();
  const text = useDebouncedValue(options.text.trim(), SEARCH_DELAY_MS);
  const validation = modelSearchQuery(
    props.kind ?? 'chat',
    options.text,
    options.filters,
    options.sort,
  );
  const debounced = modelSearchQuery(props.kind ?? 'chat', text, options.filters, options.sort);
  const query = debounced.ok ? debounced.query : { kind: props.kind ?? 'chat', sort: options.sort };
  const enabled = options.expanded && validation.ok && debounced.ok;
  const pages = useSearchModelPages(query, session, enabled);
  const visiblePages = enabled
    ? pages
    : { ...pages, models: [], total: null, error: null, loading: false, more: null };
  const sources = useModelCandidates({
    props,
    query: '',
    catalogue: visiblePages,
    enabled: false,
  });
  const rows = searchCandidates(sources.candidates, visiblePages.models, query);
  const makers = useSearchMakers(props.kind ?? 'chat', session, options.expanded);
  return {
    key: JSON.stringify([session.key, query]),
    sources,
    pages: visiblePages,
    rows: validation.ok ? rows : { ...rows, all: [], nativeCount: 0 },
    validation,
    makers,
  };
}
