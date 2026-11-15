import { API_ENDPOINTS as E, type PairedAndroidBuild } from '@smarteverything/domain';
import type { UseQueryResult } from '@tanstack/react-query';
import { api, useConnection } from '../../../api/transport';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { useStoreSelector } from '../../../store/store-context';

export const ANDROID_BUILDS_KEY = ['app-updates', 'android-builds'] as const;

export function usePairedAndroidBuilds(): UseQueryResult<readonly PairedAndroidBuild[]> {
  const connection = useConnection();
  const home = connection.status === 'paired' ? connection.connection.url : null;
  const owner = useStoreSelector((state) => state.session?.client.role === 'owner');
  return useScreenQuery({
    queryKey: [...ANDROID_BUILDS_KEY, home],
    enabled: owner && home !== null,
    queryFn: ({ signal }) => api().call(E.readAndroidAppBuilds, {}, { signal }),
  });
}
