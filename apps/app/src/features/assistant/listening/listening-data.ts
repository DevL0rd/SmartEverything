import { useEffect, useMemo } from 'react';
import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import {
  API_ENDPOINTS as E,
  type ListeningSourceChange,
  type ListeningView,
} from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import { api } from '../../../api/transport';
import { notify } from '../../../components/toast-store';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { useSyncStatus } from '../../../store/selectors';
import { useReachSettings } from '../reach/reach-data';
import { patchedView, replacedSource } from './listening-patch';

const log = new Logger('app.listening');

export const LISTENING_KEY = ['window', 'listening'] as const;

export function useListeningView(): UseQueryResult<ListeningView> {
  const query = useScreenQuery({
    queryKey: LISTENING_KEY,
    queryFn: () => api().call(E.readListening, {}),
  });
  const live = useSyncStatus().status === 'live';
  const refetch = query.refetch;
  useEffect(() => {
    if (live) background(refetch(), 'listening.refetch_failed');
  }, [live, refetch]);
  return query;
}

export function useAllowedCameras(): ReadonlySet<string> | null {
  const cameras = useReachSettings().data?.cameras;
  return useMemo(() => (cameras === undefined ? null : new Set(cameras)), [cameras]);
}

export function useHubOffline(): boolean {
  return useSyncStatus().status === 'interrupted';
}

export type ChangeListening = (
  key: string,
  change: ListeningSourceChange,
  name: string,
) => Promise<void>;

export function useListeningChange(): ChangeListening {
  const client = useQueryClient();
  return async (key, change, name) => {
    client.setQueryData<ListeningView>(LISTENING_KEY, (view) =>
      view === undefined ? view : patchedView(view, key, change),
    );
    try {
      const answer = await api().call(E.updateListeningSource, {
        params: { sourceKey: key },
        body: change,
      });
      log.info('listening.changed', { key, fields: Object.keys(change) });
      client.setQueryData<ListeningView>(LISTENING_KEY, (view) =>
        view === undefined ? view : replacedSource(view, answer),
      );
    } catch (error) {
      notify({ message: `${name} was not changed`, error, tone: 'critical' });
      background(client.invalidateQueries({ queryKey: LISTENING_KEY }), 'listening.refetch_failed');
    }
  };
}
