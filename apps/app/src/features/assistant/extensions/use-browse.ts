import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { background } from '@smarteverything/logging';
import { useIsOwner, useSyncStatus } from '../../../store/selectors';
import { useDebouncedValue } from '../../../design/use-debounced-value';
import { useDiscovery, discoveryKey, type DiscoverySelection } from './discovery';

const SEARCH_DELAY_MS = 250;
const PARAMS = z.object({
  search: z.string().optional(),
  source: z.string().min(1).optional(),
});

export type BrowseModel = ReturnType<typeof useBrowse>;

export function useBrowse(kind: DiscoverySelection['kind']): {
  readonly selection: DiscoverySelection;
  readonly query: string;
  readonly waiting: boolean;
  readonly discovery: ReturnType<typeof useDiscovery>;
  readonly changeQuery: (value: string) => void;
  readonly clearSource: () => void;
  readonly loadMore: () => void;
  readonly restart: () => void;
} {
  const params = PARAMS.parse(useLocalSearchParams());
  const router = useRouter();
  const client = useQueryClient();
  const live = useSyncStatus().status === 'live';
  const owner = useIsOwner();
  const query = params.search ?? '';
  const settled = useDebouncedValue(query.trim(), SEARCH_DELAY_MS);
  const selection = {
    kind,
    query: settled,
    ...(params.source === undefined ? {} : { source: { url: params.source } }),
  };
  const discovery = useDiscovery(selection);
  const waiting = query.trim() !== settled;
  return {
    selection,
    query,
    waiting,
    discovery,
    changeQuery: (value): void => {
      router.setParams({ search: value });
    },
    clearSource: (): void => {
      router.setParams({ source: undefined });
    },
    loadMore: (): void => {
      if (!owner || !live || waiting || !discovery.hasNextPage || discovery.isFetching) return;
      background(discovery.fetchNextPage({ cancelRefetch: false }), 'discovery.load_more_failed');
    },
    restart: (): void => {
      background(
        client.resetQueries({ queryKey: discoveryKey(selection), exact: true }),
        'discovery.reset_failed',
      );
    },
  };
}
