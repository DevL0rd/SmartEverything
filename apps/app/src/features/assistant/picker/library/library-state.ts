import { useState } from 'react';
import type { AiModelSearchSort } from '@smarteverything/domain';
import { EMPTY_MODEL_FILTERS, type ModelSearchFilters } from '../model-search-filters';
import { activeCount, toggled } from './library-model';

type LibraryPage = 'results' | 'filters' | 'detail';

export interface LibraryState {
  readonly text: string;
  readonly setText: (text: string) => void;
  readonly sort: AiModelSearchSort;
  readonly setSort: (sort: AiModelSearchSort) => void;
  readonly filters: ModelSearchFilters;
  readonly setFilters: (filters: ModelSearchFilters) => void;
  readonly sources: ReadonlySet<string>;
  readonly toggleSource: (id: string) => void;
  readonly selectedKey: string | null;
  readonly select: (key: string) => void;
  readonly page: LibraryPage;
  readonly setPage: (page: LibraryPage) => void;
  readonly reset: () => void;
  readonly active: number;
}

const NO_SOURCES: ReadonlySet<string> = new Set();

export function useLibraryState(initialQuery: string): LibraryState {
  const [text, setText] = useState(initialQuery);
  const [sort, setSort] = useState<AiModelSearchSort>('newest');
  const [filters, setFilters] = useState(EMPTY_MODEL_FILTERS);
  const [sources, setSources] = useState(NO_SOURCES);
  const [selectedKey, select] = useState<string | null>(null);
  const [page, setPage] = useState<LibraryPage>('results');
  return {
    text,
    setText,
    sort,
    setSort,
    filters,
    setFilters,
    sources,
    toggleSource: (id): void => {
      setSources((current) => toggled(current, id));
    },
    selectedKey,
    select,
    page,
    setPage,
    reset: (): void => {
      setFilters(EMPTY_MODEL_FILTERS);
      setSources(NO_SOURCES);
    },
    active: activeCount(filters, sources),
  };
}
