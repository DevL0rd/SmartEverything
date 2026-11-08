import {
  ANDROID_UPDATE_HISTORY_QUERY,
  API_ENDPOINTS as E,
  type AndroidUpdateHistory,
  type AndroidUpdateHistoryQuery,
} from '@smarteverything/domain';
import type { UseQueryResult } from '@tanstack/react-query';
import { requireOptionalNativeModule } from 'expo';
import { z } from 'zod';
import { api, useConnection } from '../../../api/transport';
import { appPlatform } from '../../../design/platform';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { RELEASE_UPDATE_CHANNEL } from '../model/adapter';
import { embeddedReleaseDate } from '../model/android-release-history';
import { androidBuild } from './android-build';

const NATIVE_LAUNCH = z.object({
  runtimeVersion: ANDROID_UPDATE_HISTORY_QUERY.shape.runtimeVersion,
  isEmbeddedLaunch: z.boolean(),
  updateId: z.uuid().optional(),
});

export type AndroidHistoryOffer = Pick<AndroidUpdateHistoryQuery, 'offerId' | 'offerKind'>;

interface CurrentPosition {
  readonly query: AndroidUpdateHistoryQuery;
  readonly embeddedId: string | undefined;
}

function currentPosition(offer: AndroidHistoryOffer): CurrentPosition | null {
  if (appPlatform() !== 'android' || __DEV__) return null;
  const build = androidBuild();
  const launch = NATIVE_LAUNCH.safeParse(requireOptionalNativeModule('ExpoUpdates'));
  if (build === undefined || !launch.success) return null;
  const { runtimeVersion, isEmbeddedLaunch, updateId } = launch.data;
  return {
    query: {
      ...offer,
      ...build,
      runtimeVersion,
      channel: RELEASE_UPDATE_CHANNEL,
      ...(isEmbeddedLaunch ? {} : { currentId: updateId }),
    },
    embeddedId: isEmbeddedLaunch ? updateId : undefined,
  };
}

export function useAndroidUpdateHistory(
  offer: AndroidHistoryOffer,
): UseQueryResult<AndroidUpdateHistory> | null {
  const connection = useConnection();
  const home = connection.status === 'paired' ? connection.connection.url : null;
  const position = home === null ? null : currentPosition(offer);
  const query = useScreenQuery({
    queryKey: ['app-updates', 'android-history', home, position],
    enabled: position !== null,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: async ({ signal }) => {
      if (position === null)
        throw new Error('The Android update history needs a running app build.');
      const { query, embeddedId } = position;
      if (embeddedId === undefined)
        return api().call(E.readAndroidUpdateHistory, { query }, { signal });
      const { manifest } = await import('expo-updates');
      const embeddedAt = embeddedReleaseDate(manifest, embeddedId);
      return api().call(
        E.readAndroidUpdateHistory,
        { query: { ...query, embeddedAt } },
        { signal },
      );
    },
  });
  return position === null ? null : query;
}
