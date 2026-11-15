import { useEffect, useState } from 'react';
import { useStableCallback } from '../../../design/use-stable-callback';
import { useFolderDemand } from '../../../store/use-folder-demand';
import { useDrivePlacementRows } from '../../drive';
import {
  sortNodes,
  type FileAbilities,
  type FileLocation,
  type FileSearch,
  type FileSortOrder,
  type FolderListing,
  type SearchQuery,
} from '../../files';
import { COMPUTER_TRASH_PLACE } from './computer-abilities';
import { crumbsOf } from './computer-crumbs';
import { useFolderData, useSearchData, useTrashData, type SearchFind } from './computer-files-data';
import {
  matchOf,
  nodeOfEntry,
  nodeOfFolder,
  nodeOfTrash,
  placedPathsOf,
  type ComputerOrigin,
  type PlacedPath,
} from './computer-node';
import { pathOfLocation } from './computer-ops';
import { baseName } from './computer-path';
import type { Reach } from './computer-reach';

export interface ListContext {
  readonly deviceId: string;
  readonly reach: Reach;
  readonly abilities: FileAbilities;
  readonly location: FileLocation;
}

const NO_NAME = (): string | null => null;

const IDLE_SEARCH: FileSearch<ComputerOrigin> = {
  matches: [],
  scanned: null,
  running: false,
  error: null,
  more: null,
  stop: null,
};

function usePlaced(deviceId: string): readonly PlacedPath[] {
  return placedPathsOf(deviceId, useDrivePlacementRows());
}

function useTrashListing(context: ListContext, sort: FileSortOrder): FolderListing<ComputerOrigin> {
  const { deviceId, reach, location } = context;
  const trash = useTrashData(
    deviceId,
    reach.online && reach.scope !== false && location.place === COMPUTER_TRASH_PLACE,
  );
  return {
    entries: sortNodes(
      trash.pages.flatMap((page) => page.entries.map(nodeOfTrash)),
      sort,
      NO_NAME,
    ),
    folder: null,
    crumbs: crumbsOf(location, reach.places),
    total: trash.pages[0]?.total ?? null,
    complete: trash.more === null && !trash.loading,
    loading: trash.loading,
    stale: trash.stale,
    error: trash.error,
    more: trash.more,
    retry: trash.retry,
  };
}

function useFilesListing(context: ListContext, sort: FileSortOrder): FolderListing<ComputerOrigin> {
  const { deviceId, reach, abilities, location } = context;
  const path = pathOfLocation(location);
  const placed = usePlaced(deviceId);
  const files = useFolderData(
    deviceId,
    path,
    sort,
    reach.online && reach.scope !== false && location.place !== COMPUTER_TRASH_PLACE,
  );
  const writable = abilities.rename;
  const crumbs = crumbsOf(location, reach.places);
  return {
    entries: files.pages.flatMap((page) =>
      page.entries.map((entry) => nodeOfEntry(entry, writable, placed)),
    ),
    folder: nodeOfFolder(path, crumbs.at(-1)?.label ?? baseName(path), writable, placed),
    crumbs,
    total: files.pages[0]?.total ?? null,
    complete: files.more === null && !files.loading,
    loading: files.loading,
    stale: files.stale,
    error: files.error,
    more: files.more,
    retry: files.retry,
  };
}

export function useComputerFolder(
  context: ListContext,
  sort: FileSortOrder,
): FolderListing<ComputerOrigin> {
  const trash = context.location.place === COMPUTER_TRASH_PLACE;
  useFolderDemand(
    context.deviceId,
    context.abilities.live && !trash ? pathOfLocation(context.location) : null,
  );
  const files = useFilesListing(context, sort);
  const trashed = useTrashListing(context, sort);
  return trash ? trashed : files;
}

interface Find {
  readonly find: SearchFind;
  readonly enabled: boolean;
}

function findOf(context: ListContext, query: SearchQuery | null): Find {
  const { reach, abilities, location } = context;
  const text = query?.text.trim() ?? '';
  return {
    find: {
      path: pathOfLocation(location),
      text,
      contents: query?.contents === true && abilities.searchContents,
    },
    enabled:
      text !== '' &&
      abilities.searchNames &&
      reach.online &&
      location.place !== COMPUTER_TRASH_PLACE,
  };
}

export function useComputerSearch(
  context: ListContext,
  query: SearchQuery | null,
): FileSearch<ComputerOrigin> {
  const { deviceId, abilities } = context;
  const { find, enabled } = findOf(context, query);
  const key = `${find.path}\n${find.text}\n${String(find.contents)}`;
  const [stopped, setStopped] = useState<string | null>(null);
  const placed = usePlaced(deviceId);
  const data = useSearchData(deviceId, find, enabled);
  const halted = stopped === key;
  const next = useStableCallback(data.next);
  useEffect(() => {
    if (!halted && data.pending) next();
  }, [halted, data.pending, next]);
  if (!enabled) return IDLE_SEARCH;
  const running = data.running && !halted;
  return {
    matches: data.pages.flatMap((page) =>
      page.matches.map((match) => matchOf(match, abilities.rename, placed)),
    ),
    scanned: data.pages.reduce((sum, page) => sum + page.scanned, 0),
    running,
    error: data.error,
    more: null,
    stop: running
      ? (): void => {
          setStopped(key);
        }
      : null,
  };
}
