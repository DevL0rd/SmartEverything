import { type UseQueryResult } from '@tanstack/react-query';
import { useScreenQuery } from '../../../queries/use-screen-query';
import {
  ApiError,
  API_ENDPOINTS as E,
  type HarnessDiscoveryItem,
  type HarnessDiscoveryPage,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { useSyncStatus } from '../../../store/selectors';
import { DISCOVERY_KEY } from '../../../queries/extension-keys';

export interface DiscoverySelection {
  readonly kind: 'skill' | 'extension';
  readonly query: string;
  readonly page: number;
  readonly source?: string;
}
interface DiscoveryResult {
  readonly selection: DiscoverySelection;
  readonly catalogue: HarnessDiscoveryPage;
}
export interface DiscoveryQuery {
  readonly data: DiscoveryResult | undefined;
  readonly error: Error | null;
  readonly isFetching: boolean;
  readonly isPlaceholderData: boolean;
  readonly refetch: () => Promise<unknown>;
}

function discoverPage(selection: DiscoverySelection): Promise<HarnessDiscoveryPage> {
  const { source, ...request } = selection;
  return api().call(E.discoverAiHarnessExtensions, {
    body: source === undefined || source === '' ? request : { ...request, source: { url: source } },
  });
}

function discoveryKey(selection: DiscoverySelection): readonly unknown[] {
  return [...DISCOVERY_KEY, selection];
}

export function useDiscovery(selection: DiscoverySelection): DiscoveryQuery {
  const sync = useSyncStatus();
  return useScreenQuery<DiscoveryResult>({
    queryKey: discoveryKey(selection),
    enabled: sync.status === 'live',
    retry: false,
    staleTime: 0,
    placeholderData: (previous) =>
      previous?.selection.kind === selection.kind &&
      previous.selection.query === selection.query &&
      previous.selection.source === selection.source
        ? previous
        : undefined,
    queryFn: async () => ({ selection, catalogue: await discoverPage(selection) }),
  });
}

const ITEM_ID = /^(skill|plugin):(.+)$/u;
const ITEM_FRESH_MS = 5 * 60 * 1000;

async function searchDiscoveryItem(
  id: string,
  selection: DiscoverySelection,
): Promise<HarnessDiscoveryItem> {
  const result = await discoverPage(selection);
  const found = result.items.find((item) => item.id === id);
  if (found !== undefined) return found;
  if (result.next_page === null) throw new ApiError('not_found', 'The catalogue has no such item.');
  return searchDiscoveryItem(id, { ...selection, page: result.next_page });
}

export function findDiscoveryItem(id: string, source?: string): Promise<HarnessDiscoveryItem> {
  const match = ITEM_ID.exec(id);
  if (match?.[1] === undefined || match[2] === undefined)
    return Promise.reject(new ApiError('not_found', 'That is not a catalogue item.'));
  return searchDiscoveryItem(id, {
    kind: match[1] === 'skill' ? 'skill' : 'extension',
    query: match[2],
    page: 1,
    ...(source === undefined ? {} : { source }),
  });
}

export function discoveryItemKey(id: string, source?: string): readonly string[] {
  return [...DISCOVERY_KEY, 'item', id, ...(source === undefined ? [] : [source])];
}

export function useDiscoveryItem(
  id: string,
  source?: string,
): UseQueryResult<HarnessDiscoveryItem> {
  const sync = useSyncStatus();
  return useScreenQuery({
    queryKey: discoveryItemKey(id, source),
    enabled: sync.status === 'live',
    retry: false,
    staleTime: ITEM_FRESH_MS,
    queryFn: () => findDiscoveryItem(id, source),
  });
}
