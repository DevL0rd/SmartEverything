import type { Engine } from '@smarteverything/domain';
import { useIsOwner } from '../../../../store/selectors';
import { useAreaStatus } from '../../data/area-status';
import { useHarnessCatalogue } from '../../data/harness';
import type { ModelPickerProps } from '../../data/model-candidates';
import { useEngineCatalogue } from '../../provider/provider-data';
import { libraryRows, libraryView, type LibraryView } from '../library/library-rows';
import { librarySources, type SourceFacts } from '../library/library-sources';
import { EMPTY_MODEL_FILTERS } from '../model-search-filters';
import type { SearchCandidates } from '../model-search-candidates';
import { useSearchPickerData, type SearchPickerData } from '../model-search-data';
import { engineMachineId } from './panel-machine';
import { idleEntries, rowEntries, searchEntries, searchRows, type PanelEntry } from './panel-items';
import { background } from '@smarteverything/logging';

const NO_SOURCES: ReadonlySet<string> = new Set();

export interface PanelData {
  readonly search: SearchPickerData;
  readonly entries: readonly PanelEntry[];
  readonly view: LibraryView;
  readonly total: number | null;
  readonly retry: () => void;
}

export interface PanelDataInput {
  readonly picker: ModelPickerProps;
  readonly text: string;
  readonly recent: readonly string[];
  readonly engine: Engine;
}

function everything(rows: SearchPickerData['sources']['candidates']): SearchCandidates {
  return { current: [], favorites: [], all: rows, nativeCount: 0 };
}

function entriesOf(
  input: PanelDataInput,
  search: SearchPickerData,
  facts: SourceFacts,
): readonly PanelEntry[] {
  const interactive = input.picker.onPick !== null;
  const candidates = libraryRows(
    everything(search.sources.candidates),
    facts,
    interactive,
    NO_SOURCES,
  );
  if (input.text.trim() === '') {
    const machineId = engineMachineId(input.engine);
    return idleEntries({
      rows: candidates,
      recent: input.recent,
      machineId,
      machineName: librarySources(facts).find((source) => source.id === machineId)?.name ?? null,
    });
  }
  const found = libraryRows(search.rows, facts, interactive, NO_SOURCES);
  const names = new Map(librarySources(facts).map((source) => [source.id, source.label]));
  return searchEntries({
    rows: searchRows(candidates, found, input.text),
    groupName: (id) => names.get(id) ?? id,
  });
}

export function usePanelData(input: PanelDataInput): PanelData {
  const searching = input.text.trim() !== '';
  const search = useSearchPickerData(input.picker, {
    text: input.text,
    expanded: searching,
    filters: EMPTY_MODEL_FILTERS,
    sort: 'newest',
  });
  const harness = useHarnessCatalogue();
  const engines = useEngineCatalogue();
  const owner = useIsOwner();
  const area = useAreaStatus();
  const facts = { harness: harness.data, engines: engines.data, owner };
  const entries = entriesOf(input, search, facts);
  const failed = searching ? search.pages.error !== null : harness.isError || engines.isError;
  const loading = searching
    ? search.pages.pending || search.pages.loading
    : harness.isLoading || engines.isLoading;
  return {
    search,
    entries,
    total: search.pages.total,
    retry: (): void => {
      if (searching) {
        search.pages.retry();
        return;
      }
      background(harness.refetch(), 'harness.refetch_failed');
      background(engines.refetch(), 'engines.refetch_failed');
    },
    view: libraryView({
      rows: rowEntries(entries).length,
      failed,
      loading,
      reachable: area.kind !== 'offline-empty',
    }),
  };
}
