import { useState } from 'react';
import type { FileEntry, FilePlaces } from '@smarteverything/domain';
import { useDebouncedValue } from '../../../design/use-debounced-value';
import {
  useComputerFolder,
  useComputerPlaces,
  useFileSearch,
  useFolderPages,
  type FileSearch,
  type FolderPages,
} from '../data/computer-files';
import { orderEntries } from './path-model';

const SEARCH_SETTLE_MS = 400;

export interface Browse {
  readonly pages: FolderPages;
  readonly home: string | null;
  readonly places: FilePlaces | undefined;
  readonly here: string;
  readonly showHidden: boolean;
  readonly toggleHidden: () => void;
  readonly go: (path: string) => void;
  readonly searchOpen: boolean;
  readonly toggleSearch: () => void;
  readonly query: string;
  readonly setQuery: (query: string) => void;
  readonly search: FileSearch | null;
  readonly entries: readonly FileEntry[];
  readonly searching: boolean;
}

function hereOf(loaded: string | undefined, path: string | null, home: string | null): string {
  return loaded ?? path ?? home ?? '/';
}

function shown(
  searching: boolean,
  source: readonly FileEntry[],
  showHidden: boolean,
): readonly FileEntry[] {
  return searching
    ? source.filter((entry) => showHidden || !entry.hidden)
    : orderEntries(source, showHidden);
}

export function useBrowse(deviceId: string, online: boolean, start: string | null): Browse {
  const [path, setPath] = useState<string | null>(start);
  const [showHidden, setShowHidden] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const pages = useFolderPages(deviceId, path, online);
  const home = useComputerFolder(deviceId, null, online).data?.path ?? null;
  const places = useComputerPlaces(deviceId, online).data;
  const here = hereOf(pages.first?.path, path, home);
  const text = useDebouncedValue(query, SEARCH_SETTLE_MS).trim();
  const searching = searchOpen && text !== '';
  const found = useFileSearch(deviceId, searching ? here : null, text);
  const source = searching ? found.matches : pages.entries;
  return {
    pages,
    home,
    places,
    here,
    showHidden,
    toggleHidden: (): void => {
      setShowHidden(!showHidden);
    },
    go: (next): void => {
      setPath(next);
      setQuery('');
      setSearchOpen(false);
    },
    searchOpen,
    toggleSearch: (): void => {
      setSearchOpen(!searchOpen);
      setQuery('');
    },
    query,
    setQuery,
    search: searching ? found : null,
    entries: shown(searching, source, showHidden),
    searching,
  };
}
