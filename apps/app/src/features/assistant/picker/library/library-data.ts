import { useIsOwner } from '../../../../store/selectors';
import { useAreaStatus } from '../../data/area-status';
import type { ModelPickerProps } from '../../data/model-candidates';
import { useHarnessCatalogue } from '../../data/harness';
import { useEngineCatalogue } from '../../provider/provider-data';
import { useSearchPickerData, type SearchPickerData } from '../model-search-data';
import type { LibraryState } from './library-state';
import {
  libraryRows,
  libraryView,
  selectedRow,
  type LibraryRow,
  type LibraryView,
} from './library-rows';
import { librarySources, type LibrarySource } from './library-sources';

export interface LibraryData {
  readonly search: SearchPickerData;
  readonly rows: readonly LibraryRow[];
  readonly sources: readonly LibrarySource[];
  readonly selected: LibraryRow | null;
  readonly view: LibraryView;
}

export function useLibraryData(props: ModelPickerProps, state: LibraryState): LibraryData {
  const search = useSearchPickerData(props, {
    text: state.text,
    expanded: true,
    filters: state.filters,
    sort: state.sort,
  });
  const harness = useHarnessCatalogue();
  const engines = useEngineCatalogue();
  const owner = useIsOwner();
  const area = useAreaStatus();
  const facts = { harness: harness.data, engines: engines.data, owner };
  const rows = libraryRows(search.rows, facts, props.onPick !== null, state.sources);
  return {
    search,
    rows,
    sources: librarySources(facts),
    selected: selectedRow(rows, state.selectedKey),
    view: libraryView({
      rows: rows.length,
      failed: search.pages.error !== null,
      loading: search.pages.pending || search.pages.loading,
      reachable: area.kind !== 'offline-empty',
    }),
  };
}
