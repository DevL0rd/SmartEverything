import { Logger, background } from '@smarteverything/logging';
import {
  keepPreviousData,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  API_ENDPOINTS as E,
  type FileContent,
  type FileEntry,
  type FileList,
  type FilePlaces,
  type FileProperties,
  type FileSearchResult,
  type FileWriteChange,
  type FileWriteResult,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { notify } from '../../../components/toast-store';
import { useScreenInfiniteQuery, useScreenQuery } from '../../../queries/use-screen-query';
import { doneMessage, failureMessage, trashIdsOf } from '../files/file-model';

const log = new Logger('app.computers');

function computerFilesKey(deviceId: string): readonly string[] {
  return ['window', 'computer-files', deviceId];
}

export function useComputerFolder(
  deviceId: string,
  path: string | null,
  enabled: boolean,
): ReturnType<typeof useScreenQuery<FileList>> {
  return useScreenQuery({
    queryKey: [...computerFilesKey(deviceId), 'folder', path],
    queryFn: () =>
      api().call(E.listComputerFiles, {
        params: { deviceId },
        query: path === null ? {} : { path },
      }),
    enabled,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function useComputerPlaces(
  deviceId: string,
  enabled: boolean,
): ReturnType<typeof useScreenQuery<FilePlaces>> {
  return useScreenQuery({
    queryKey: [...computerFilesKey(deviceId), 'places'],
    queryFn: () => api().call(E.readComputerPlaces, { params: { deviceId } }),
    enabled,
    retry: false,
  });
}

export interface FolderPages {
  readonly first: FileList | undefined;
  readonly entries: readonly FileEntry[];
  readonly stale: boolean;
  readonly error: unknown;
  readonly loadingMore: boolean;
  readonly more: () => void;
  readonly retry: () => void;
}

export function useFolderPages(
  deviceId: string,
  path: string | null,
  enabled: boolean,
): FolderPages {
  const query = useScreenInfiniteQuery<
    FileList,
    Error,
    InfiniteData<FileList>,
    readonly (string | null)[],
    number
  >({
    queryKey: [...computerFilesKey(deviceId), 'pages', path],
    queryFn: ({ pageParam }) =>
      api().call(E.listComputerFiles, {
        params: { deviceId },
        query: {
          ...(path === null ? {} : { path }),
          ...(pageParam === 0 ? {} : { cursor: pageParam }),
        },
      }),
    initialPageParam: 0,
    getNextPageParam: (last) => last.next ?? undefined,
    enabled,
    placeholderData: keepPreviousData,
    retry: false,
  });
  return {
    first: query.data?.pages[0],
    entries: query.data?.pages.flatMap((page) => page.entries) ?? [],
    stale: query.isPlaceholderData,
    error: query.isError ? query.error : null,
    loadingMore: query.isFetchingNextPage,
    more: (): void => {
      if (query.hasNextPage && !query.isFetchingNextPage)
        background(query.fetchNextPage(), 'files.more_failed');
    },
    retry: (): void => {
      background(query.refetch(), 'files.refetch_failed');
    },
  };
}

export function useComputerFile(
  deviceId: string,
  path: string,
): ReturnType<typeof useScreenQuery<FileContent>> {
  return useScreenQuery({
    queryKey: [...computerFilesKey(deviceId), 'file', path],
    queryFn: () => api().call(E.readComputerFile, { params: { deviceId }, query: { path } }),
    retry: false,
  });
}

export function useFileProperties(
  deviceId: string,
  path: string | null,
): ReturnType<typeof useScreenQuery<FileProperties>> {
  return useScreenQuery({
    queryKey: [...computerFilesKey(deviceId), 'properties', path],
    queryFn: () =>
      api().call(E.readComputerFileProperties, {
        params: { deviceId },
        query: { path: path ?? '/' },
      }),
    enabled: path !== null,
    retry: false,
  });
}

export interface FileSearch {
  readonly matches: readonly FileEntry[];
  readonly scanned: number;
  readonly running: boolean;
  readonly error: unknown;
  readonly stop: () => void;
}

export function useFileSearch(deviceId: string, folder: string | null, text: string): FileSearch {
  const key = `${folder ?? ''}|${text}`;
  const [stopped, setStopped] = useState<string | null>(null);
  const query = useScreenInfiniteQuery<
    FileSearchResult,
    Error,
    InfiniteData<FileSearchResult>,
    readonly (string | null)[],
    string | null
  >({
    queryKey: [...computerFilesKey(deviceId), 'search', folder, text],
    queryFn: ({ pageParam }) =>
      api().call(E.searchComputerFiles, {
        params: { deviceId },
        query: { path: folder ?? '/', text, ...(pageParam === null ? {} : { cursor: pageParam }) },
      }),
    initialPageParam: null,
    getNextPageParam: (last) => last.next ?? undefined,
    enabled: folder !== null && text !== '',
    retry: false,
  });
  const { hasNextPage, isFetching, isError, fetchNextPage } = query;
  const halted = stopped === key;
  useEffect(() => {
    if (!halted && hasNextPage && !isFetching && !isError) {
      background(fetchNextPage(), 'files.search_failed');
    }
  }, [halted, hasNextPage, isFetching, isError, fetchNextPage]);
  const pages = query.data?.pages ?? [];
  return {
    matches: pages.flatMap((page) => page.matches),
    scanned: pages.reduce((sum, page) => sum + page.scanned, 0),
    running: !halted && !isError && (isFetching || hasNextPage),
    error: isError ? query.error : null,
    stop: (): void => {
      setStopped(key);
    },
  };
}

export interface FileOps {
  readonly run: (change: FileWriteChange) => Promise<FileWriteResult | null>;
  readonly pending: boolean;
}

export function useFileOps(deviceId: string): FileOps {
  const client = useQueryClient();
  const write = useMutation({
    mutationFn: (change: FileWriteChange) =>
      api().call(E.writeComputerFiles, { params: { deviceId }, body: change }),
  });
  const refresh = (): void => {
    background(
      client.invalidateQueries({ queryKey: computerFilesKey(deviceId) }),
      'queries.invalidate_failed',
    );
  };
  const run = async (change: FileWriteChange): Promise<FileWriteResult | null> => {
    log.info('files.write_started', { deviceId, action: change.action });
    try {
      const result = await write.mutateAsync(change);
      refresh();
      announce(change, result, run);
      return result;
    } catch (error) {
      log.error('files.write_failed', error, { deviceId, action: change.action });
      notify({ message: 'That didn’t work', error, tone: 'critical' });
      return null;
    }
  };
  return { run, pending: write.isPending };
}

function announce(
  change: FileWriteChange,
  result: FileWriteResult,
  run: (change: FileWriteChange) => Promise<FileWriteResult | null>,
): void {
  for (const failure of result.failed) {
    notify({ message: failureMessage(change, failure.path, failure.reason), tone: 'critical' });
  }
  const message = doneMessage(change, result);
  if (message === null) return;
  const items = trashIdsOf(result);
  if (change.action === 'trash' && items.length > 0) {
    notify({
      message,
      undo: () => {
        background(run({ action: 'restore', items }), 'files.restore_failed');
      },
    });
    return;
  }
  notify({ message });
}
