import { CancelledError, keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  API_ENDPOINTS as E,
  type HarnessDiscoveryItem,
  type HarnessDiscoveryPage,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { useSyncStatus } from '../../../store/selectors';
import { useHarnessSupported } from '../data/harness';
import { DISCOVERY_KEY } from '../../../queries/extension-keys';

export interface DiscoverySelection {
  readonly kind: 'skill' | 'extension';
  readonly query: string;
  readonly page: number;
  readonly snapshot?: string;
}
export interface DiscoveryResult {
  readonly selection: DiscoverySelection;
  readonly catalogue: HarnessDiscoveryPage;
}
export function discoveryItemKey(id: string): readonly string[] {
  return ['window', 'ai-harness-discovery-item', id];
}
export interface DiscoveryQuery {
  readonly data: DiscoveryResult | undefined;
  readonly error: Error | null;
  readonly isFetching: boolean;
  readonly isPlaceholderData: boolean;
  readonly refetch: () => Promise<unknown>;
}
export function useDiscovery(selection: DiscoverySelection): DiscoveryQuery {
  const client = useQueryClient();
  const retainedKey = [...DISCOVERY_KEY, 'retained', selection.kind, selection.query];
  const retained = useQuery<DiscoveryResult>({ queryKey: retainedKey, enabled: false });
  const supported = useHarnessSupported();
  const sync = useSyncStatus();
  const query = useQuery<DiscoveryResult>({
    queryKey: [...DISCOVERY_KEY, selection],
    enabled: supported && sync.status === 'live',
    retry: false,
    staleTime: 0,
    placeholderData: (previous) =>
      previous?.selection.kind === selection.kind && previous.selection.query === selection.query
        ? keepPreviousData(previous)
        : undefined,
    queryFn: async ({ signal }): Promise<DiscoveryResult> => {
      const catalogue = await api().call(E.discoverAiHarnessExtensions, { body: selection });
      if (signal.aborted) throw new CancelledError({ silent: true });
      const result = { selection, catalogue };
      client.setQueryData(retainedKey, result);
      return result;
    },
  });
  const data = query.data ?? retained.data;
  return {
    ...query,
    data,
    isPlaceholderData: data !== undefined && data.selection.page !== selection.page,
  };
}
export function useDiscoveryItem(id: string): ReturnType<typeof useQuery<HarnessDiscoveryItem>> {
  return useQuery({ queryKey: discoveryItemKey(id), enabled: false });
}
