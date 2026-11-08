import {
  API_ENDPOINTS as E,
  hubUpdateFinished,
  type HubUpdateAcceptance,
  type HubUpdateSourceCheck,
  type HubUpdateSourceSave,
  type HubUpdateSourceSaved,
  type HubUpdateSourceStart,
  type SelfUpdateRecoveryStatus,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import {
  useIsMutating,
  useMutation,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { api, useConnection } from '../../../api/transport';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { noticeHandler } from '../../../store/notice-registry';
import { useStoreSelector } from '../../../store/store-context';
import { HUB_UPDATE_SOURCE_KEY } from './source-notices';

const RECOVERY_KEY = ['hub-updates', 'recovery'] as const;

function sourceKey(home: string | null, id: string | null): readonly unknown[] {
  return [...HUB_UPDATE_SOURCE_KEY, home, id];
}

function startKey(home: string | null, id: string | null): readonly unknown[] {
  return ['hub-updates', 'start', home, id];
}

export function refreshSourceAfterRelease(
  previous: SelfUpdateRecoveryStatus | undefined,
  current: SelfUpdateRecoveryStatus,
  client: QueryClient,
  queryKey: ReturnType<typeof sourceKey>,
): void {
  const release = current.release;
  if (release === null || !hubUpdateFinished(release)) return;
  if (previous?.release?.runId === release.runId && previous.release.phase === release.phase)
    return;
  background(client.resetQueries({ queryKey, exact: true }), 'hub_update.source_refresh_failed');
}

export const HUB_UPDATE_NOTICES = noticeHandler(
  ['hub_update_status_changed'],
  (_notice, { client }) => {
    const filter = { queryKey: RECOVERY_KEY };
    background(
      client.cancelQueries(filter).then(() => client.invalidateQueries(filter)),
      'hub_update.status_refresh_failed',
    );
  },
);

function useUpdateScope(): {
  readonly home: string | null;
  readonly id: string | null;
  readonly owner: boolean;
} {
  const connection = useConnection();
  const home = connection.status === 'paired' ? connection.connection.url : null;
  const client = useStoreSelector((state) => state.session?.client);
  return { home, id: client?.id ?? null, owner: client?.role === 'owner' };
}

export function useHubUpdateSource(automatic = false): UseQueryResult<HubUpdateSourceCheck> {
  const { home, id, owner } = useUpdateScope();
  return useScreenQuery({
    queryKey: sourceKey(home, id),
    enabled: automatic && home !== null && owner,
    staleTime: 0,
    retry: false,
    queryFn: ({ signal }) => api().call(E.checkHubUpdateSource, {}, { signal }),
  });
}

export function useHubUpdateStatus(automatic = true): UseQueryResult<SelfUpdateRecoveryStatus> {
  const { home, id, owner } = useUpdateScope();
  const client = useQueryClient();
  const queryKey = [...RECOVERY_KEY, home, id];
  return useScreenQuery({
    queryKey,
    enabled: automatic && home !== null && owner,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    queryFn: async ({ signal }) => {
      const status = await api().call(E.readHubUpdateRecovery, {}, { signal });
      if (!signal.aborted)
        refreshSourceAfterRelease(
          client.getQueryData<SelfUpdateRecoveryStatus>(queryKey),
          status,
          client,
          sourceKey(home, id),
        );
      return status;
    },
  });
}

type StartMutation = Pick<
  UseMutationResult<HubUpdateAcceptance, Error, HubUpdateSourceStart>,
  'data' | 'isError' | 'isPending' | 'mutate' | 'variables'
>;

export function useHubUpdateStarting(): boolean {
  const { home, id } = useUpdateScope();
  return useIsMutating({ mutationKey: startKey(home, id) }) > 0;
}

export function useStartHubUpdateSource(): StartMutation {
  const { home, id } = useUpdateScope();
  const queries = useQueryClient();
  const mutationKey = startKey(home, id);
  const start = useMutation({
    mutationKey,
    networkMode: 'always',
    retry: false,
    mutationFn: (body: HubUpdateSourceStart) => api().call(E.startHubUpdateSource, { body }),
    onSettled: () => {
      const filter = { queryKey: [...RECOVERY_KEY, home, id], exact: true };
      return queries.cancelQueries(filter).then(() => queries.invalidateQueries(filter));
    },
  });
  return {
    data: start.data,
    isError: start.isError,
    isPending: start.isPending,
    variables: start.variables,
    mutate: (body, options): void => {
      if (queries.isMutating({ mutationKey }) === 0) start.mutate(body, options);
    },
  };
}

export function useSaveHubUpdateSource(): UseMutationResult<
  HubUpdateSourceSaved,
  Error,
  HubUpdateSourceSave
> {
  return useMutation({
    networkMode: 'always',
    retry: false,
    mutationFn: (body) => api().call(E.saveHubUpdateSource, { body }),
  });
}
