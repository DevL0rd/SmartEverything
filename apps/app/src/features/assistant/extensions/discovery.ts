import type {
  InfiniteData,
  UseInfiniteQueryOptions,
  UseInfiniteQueryResult,
  UseQueryResult,
} from '@tanstack/react-query';
import { useScreenInfiniteQuery, useScreenQuery } from '../../../queries/use-screen-query';
import {
  ApiError,
  API_ENDPOINTS as E,
  sameHarnessGitOrigin,
  type HarnessDiscoveryItem,
  type HarnessDiscoveryKind,
  type HarnessDiscoveryPage,
  type HarnessExtensionSourceRequest,
  type HarnessGitOrigin,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { useIsOwner, useSyncStatus } from '../../../store/selectors';
import { DISCOVERY_KEY } from '../../../queries/extension-keys';

export interface DiscoverySelection {
  readonly kind: 'skill' | 'extension';
  readonly query: string;
  readonly source?: HarnessExtensionSourceRequest;
}

export interface DiscoveryTarget {
  readonly id: string;
  readonly source?: HarnessExtensionSourceRequest;
  readonly origin?: HarnessGitOrigin | undefined;
}

interface DiscoveryCursor {
  readonly page: number;
  readonly snapshot?: string;
}

const FIRST_PAGE: DiscoveryCursor = { page: 1 };

function discoverPage(
  { kind, ...selection }: DiscoverySelection,
  cursor: DiscoveryCursor,
  signal?: AbortSignal,
): Promise<HarnessDiscoveryPage> {
  return api().call(
    E.discoverAiHarnessExtensions,
    { body: { ...selection, ...cursor, kind: discoveryKind(kind) } },
    signal === undefined ? undefined : { signal },
  );
}

function discoveryKind(kind: DiscoverySelection['kind']): HarnessDiscoveryKind {
  return kind === 'skill' ? 'skill' : 'plugin';
}

export type DiscoveryQuery = UseInfiniteQueryResult<InfiniteData<HarnessDiscoveryPage>>;

export function discoveryKey(selection: DiscoverySelection): readonly unknown[] {
  return [...DISCOVERY_KEY, selection];
}

export function discoveryOptions(
  selection: DiscoverySelection,
  enabled: boolean,
): UseInfiniteQueryOptions<
  HarnessDiscoveryPage,
  Error,
  InfiniteData<HarnessDiscoveryPage>,
  readonly unknown[],
  DiscoveryCursor
> {
  return {
    queryKey: discoveryKey(selection),
    enabled,
    retry: false,
    initialPageParam: FIRST_PAGE,
    getNextPageParam: (page) =>
      page.next_page === null ? undefined : { page: page.next_page, snapshot: page.snapshot },
    queryFn: ({ pageParam, signal }) => discoverPage(selection, pageParam, signal),
  };
}

export function useDiscovery(selection: DiscoverySelection): DiscoveryQuery {
  const owner = useIsOwner();
  const live = useSyncStatus().status === 'live';
  return useScreenInfiniteQuery(discoveryOptions(selection, live && owner));
}

const ITEM_ID = /^(skill|plugin):(.+)$/u;
const ITEM_FRESH_MS = 5 * 60 * 1000;

async function searchDiscoveryItem(
  target: DiscoveryTarget,
  selection: DiscoverySelection,
  cursor: DiscoveryCursor,
  signal: AbortSignal | undefined,
): Promise<HarnessDiscoveryItem> {
  const result = await discoverPage(selection, cursor, signal);
  const found = result.items.find((item) => matchesTarget(item, target));
  if (found !== undefined) return found;
  if (result.next_page === null) throw new ApiError('not_found', 'The catalogue has no such item.');
  return searchDiscoveryItem(
    target,
    selection,
    { page: result.next_page, snapshot: result.snapshot },
    signal,
  );
}

function matchesTarget(item: HarnessDiscoveryItem, target: DiscoveryTarget): boolean {
  if (item.id !== target.id) return false;
  const { origin } = item.reference;
  return (
    target.origin === undefined ||
    (origin !== undefined && sameHarnessGitOrigin(origin, target.origin))
  );
}

export function findDiscoveryItem(
  target: DiscoveryTarget,
  signal?: AbortSignal,
): Promise<HarnessDiscoveryItem> {
  const { id, source } = target;
  const match = ITEM_ID.exec(id);
  if (match?.[1] === undefined || match[2] === undefined)
    return Promise.reject(new ApiError('not_found', 'That is not a catalogue item.'));
  return searchDiscoveryItem(
    target,
    {
      kind: match[1] === 'skill' ? 'skill' : 'extension',
      query: match[2],
      ...(source === undefined ? {} : { source }),
    },
    FIRST_PAGE,
    signal,
  );
}

export function discoveryItemKey({ id, source, origin }: DiscoveryTarget): readonly unknown[] {
  return [...DISCOVERY_KEY, 'item', id, source, origin];
}

export function useDiscoveryItem(target: DiscoveryTarget): UseQueryResult<HarnessDiscoveryItem> {
  const owner = useIsOwner();
  const live = useSyncStatus().status === 'live';
  return useScreenQuery({
    queryKey: discoveryItemKey(target),
    enabled: owner && live,
    retry: false,
    staleTime: ITEM_FRESH_MS,
    queryFn: ({ signal }) => findDiscoveryItem(target, signal),
  });
}
