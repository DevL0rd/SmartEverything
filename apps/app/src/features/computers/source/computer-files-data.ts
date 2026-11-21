import { background } from '@smarteverything/logging';
import { keepPreviousData, type InfiniteData } from '@tanstack/react-query';
import {
  API_ENDPOINTS as E,
  type ComputerFileLinks,
  type DriveZipPage,
  type FileContent,
  type FileList,
  type FilePlaces,
  type FileProperties,
  type FileSearchResult,
  type FileTrashList,
  type FileWriteChange,
  type FileWriteResult,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { useScreenInfiniteQuery, useScreenQuery } from '../../../queries/use-screen-query';
import type { FileSortOrder } from '../../files';
import { useRouteGeneration } from '../../drive';
import { filesKey, listKey, placesKey } from './computer-keys';

export const LINK_RENEW_LEAD_MS = 60_000;

export interface Pages<T> {
  readonly pages: readonly T[];
  readonly stale: boolean;
  readonly loading: boolean;
  readonly error: unknown;
  readonly more: (() => void) | null;
  readonly retry: () => void;
}

interface InfinitePages<T> {
  readonly data: InfiniteData<T> | undefined;
  readonly isPlaceholderData: boolean;
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly error: Error | null;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly fetchNextPage: () => Promise<unknown>;
  readonly refetch: () => Promise<unknown>;
}

function pagesOf<T>(query: InfinitePages<T>, enabled: boolean): Pages<T> {
  return {
    pages: query.data?.pages ?? [],
    stale: query.isPlaceholderData,
    loading: enabled && query.isPending,
    error: query.isError ? query.error : null,
    more:
      query.hasNextPage && !query.isFetchingNextPage
        ? (): void => {
            background(query.fetchNextPage(), 'files.more_failed');
          }
        : null,
    retry: (): void => {
      background(query.refetch(), 'files.refetch_failed');
    },
  };
}

export function usePlacesData(
  deviceId: string,
  enabled: boolean,
): ReturnType<typeof useScreenQuery<FilePlaces>> {
  return useScreenQuery({
    queryKey: placesKey(deviceId),
    queryFn: ({ signal }) => api().call(E.readComputerPlaces, { params: { deviceId } }, { signal }),
    enabled,
    retry: false,
  });
}

export function useFolderData(
  deviceId: string,
  path: string | null,
  sort: FileSortOrder,
  enabled: boolean,
): Pages<FileList> {
  const live = enabled && path !== null;
  const query = useScreenInfiniteQuery<
    FileList,
    Error,
    InfiniteData<FileList>,
    readonly string[],
    number
  >({
    queryKey: [...listKey(deviceId, path ?? ''), sort.field, sort.direction],
    queryFn: ({ pageParam, signal }) =>
      api().call(
        E.listComputerFiles,
        {
          params: { deviceId },
          query: {
            ...(path === null ? {} : { path }),
            ...(pageParam === 0 ? {} : { cursor: pageParam }),
            ...(sort.field === 'by' ? {} : { sort: sort.field, direction: sort.direction }),
          },
        },
        { signal },
      ),
    initialPageParam: 0,
    getNextPageParam: (last) => last.next ?? undefined,
    enabled: live,
    placeholderData: keepPreviousData,
    retry: false,
  });
  return pagesOf(query, live);
}

export function useTrashData(deviceId: string, enabled: boolean): Pages<FileTrashList> {
  const query = useScreenInfiniteQuery<
    FileTrashList,
    Error,
    InfiniteData<FileTrashList>,
    readonly string[],
    number
  >({
    queryKey: [...filesKey(deviceId), 'trash'],
    queryFn: ({ pageParam, signal }) =>
      api().call(
        E.listComputerTrash,
        { params: { deviceId }, query: { cursor: pageParam } },
        { signal },
      ),
    initialPageParam: 0,
    getNextPageParam: (last) => last.next ?? undefined,
    enabled,
    retry: false,
  });
  return pagesOf(query, enabled);
}

export interface SearchData {
  readonly pages: readonly FileSearchResult[];
  readonly running: boolean;
  readonly pending: boolean;
  readonly error: unknown;
  readonly next: () => void;
}

export interface SearchFind {
  readonly path: string;
  readonly text: string;
  readonly contents: boolean;
}

function streaming(query: {
  readonly isError: boolean;
  readonly isFetching: boolean;
  readonly hasNextPage: boolean;
}): boolean {
  return !query.isError && (query.isFetching || query.hasNextPage);
}

function searchPageOf(
  deviceId: string,
  find: SearchFind,
  cursor: string | null,
  signal: AbortSignal,
): Promise<FileSearchResult> {
  return api().call(
    E.searchComputerFiles,
    { params: { deviceId }, query: { ...find, ...(cursor === null ? {} : { cursor }) } },
    { signal },
  );
}

export function useSearchData(deviceId: string, find: SearchFind, enabled: boolean): SearchData {
  const { path, text, contents } = find;
  const query = useScreenInfiniteQuery<
    FileSearchResult,
    Error,
    InfiniteData<FileSearchResult>,
    readonly string[],
    string | null
  >({
    queryKey: [...filesKey(deviceId), 'find', path, text, contents ? 'contents' : 'names'],
    queryFn: ({ pageParam, signal }) => searchPageOf(deviceId, find, pageParam, signal),
    initialPageParam: null,
    getNextPageParam: (last) => last.next ?? undefined,
    enabled,
    retry: false,
  });
  const { hasNextPage, isFetching, isError, fetchNextPage } = query;
  const idle = hasNextPage && !isFetching && !isError;
  return {
    pages: query.data?.pages ?? [],
    running: enabled && streaming(query),
    pending: enabled && idle,
    error: isError ? query.error : null,
    next: (): void => {
      if (idle) background(fetchNextPage(), 'files.search_failed');
    },
  };
}

export function usePropertiesData(
  deviceId: string,
  path: string,
  enabled: boolean,
): ReturnType<typeof useScreenQuery<FileProperties>> {
  return useScreenQuery({
    queryKey: [...filesKey(deviceId), 'properties', path],
    queryFn: ({ signal }) =>
      api().call(
        E.readComputerFileProperties,
        { params: { deviceId }, query: { path } },
        { signal },
      ),
    enabled,
    retry: false,
  });
}

export interface PresentedLinks {
  readonly file: string;
  readonly thumb: string | null;
  readonly expiresAt: number;
}

async function presentedLinksOf(
  deviceId: string,
  path: string,
  signal: AbortSignal,
): Promise<PresentedLinks> {
  const client = api().forMedia();
  const links: ComputerFileLinks = await client.call(
    E.computerFileLinks,
    { params: { deviceId }, query: { path } },
    { signal },
  );
  const [file, thumb] = await Promise.all([
    client.resourceUrl(links.file.url, links.file.expiresAt, 'attachment'),
    links.thumb === null
      ? Promise.resolve(null)
      : client.resourceUrl(links.thumb.url, links.thumb.expiresAt, 'image'),
  ]);
  const expiries = [links.file.expiresAt, ...(links.thumb === null ? [] : [links.thumb.expiresAt])];
  return { file, thumb, expiresAt: Math.min(...expiries.map((moment) => Date.parse(moment))) };
}

export function useLinksData(
  deviceId: string,
  path: string,
  modifiedAt: string | null,
  enabled: boolean,
): ReturnType<typeof useScreenQuery<PresentedLinks>> {
  const generation = useRouteGeneration();
  return useScreenQuery({
    queryKey: [...filesKey(deviceId), 'links', path, modifiedAt, generation],
    queryFn: ({ signal }) => presentedLinksOf(deviceId, path, signal),
    enabled,
    retry: false,
    staleTime: (query) =>
      Math.max(0, (query.state.data?.expiresAt ?? 0) - Date.now() - LINK_RENEW_LEAD_MS),
  });
}

export function useZipData(deviceId: string, path: string, enabled: boolean): Pages<DriveZipPage> {
  const query = useScreenInfiniteQuery<
    DriveZipPage,
    Error,
    InfiniteData<DriveZipPage>,
    readonly string[],
    string | null
  >({
    queryKey: [...filesKey(deviceId), 'zip', path],
    queryFn: ({ pageParam, signal }) =>
      api().call(
        E.listComputerZipEntries,
        {
          params: { deviceId },
          query: { path, ...(pageParam === null ? {} : { cursor: pageParam }) },
        },
        { signal },
      ),
    initialPageParam: null,
    getNextPageParam: (last) => last.next ?? undefined,
    enabled,
    retry: false,
  });
  return pagesOf(query, enabled);
}

export async function zipEntryLinkOf(
  deviceId: string,
  path: string,
  index: number,
): Promise<string> {
  const client = api().forMedia();
  const link = await client.call(E.computerZipEntryLink, {
    params: { deviceId },
    query: { path, index },
  });
  return client.resourceUrl(link.file.url, link.file.expiresAt, 'attachment');
}

export function writeFiles(deviceId: string, change: FileWriteChange): Promise<FileWriteResult> {
  return api().call(E.writeComputerFiles, { params: { deviceId }, body: change });
}

export function readFileContent(deviceId: string, path: string): Promise<FileContent> {
  return api().call(E.readComputerFile, { params: { deviceId }, query: { path } });
}
