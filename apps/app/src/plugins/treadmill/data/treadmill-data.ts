import type {
  TreadmillLiveFrame,
  TreadmillReadQuery,
  TreadmillStateView,
} from '@smarteverything/domain';
import { useMemo } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { readTreadmillView, type TreadmillViewOf } from '../../../api/treadmills';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { useLiveDemand } from '../../../store/use-live-demand';
import { mergePoints, newerFrame, seedPoints, type LivePoint } from '../model/speed-history';
import { treadmillKey } from './treadmill-keys';
import { useTreadmillLive } from './treadmill-live';

const LIVE_TOPICS = ['live'] as const;

export function useTreadmillView<K extends TreadmillReadQuery['view']>(
  deviceId: string,
  kind: K,
  query: Omit<TreadmillReadQuery, 'view'> = {},
  enabled = true,
): UseQueryResult<TreadmillViewOf<K>> {
  return useScreenQuery({
    queryKey: treadmillKey(deviceId, { ...query, view: kind }),
    queryFn: () => readTreadmillView(deviceId, kind, query),
    enabled,
    staleTime: Infinity,
  });
}

export function useTreadmillState(deviceId: string): UseQueryResult<TreadmillStateView> {
  return useTreadmillView(deviceId, 'state');
}

export function useTreadmillDemand(deviceId: string, onScreen = true): void {
  useLiveDemand(deviceId, LIVE_TOPICS, undefined, onScreen);
}

export function useLiveSelect<T>(
  deviceId: string,
  loaded: TreadmillLiveFrame,
  pick: (frame: TreadmillLiveFrame) => T,
): T {
  return useTreadmillLive(deviceId, (live) => pick(newerFrame(live.frame, loaded)));
}

export function useLivePoints(
  deviceId: string,
  recent: TreadmillStateView['recentSpeed'],
): readonly LivePoint[] {
  const live = useTreadmillLive(deviceId, (state) => state.points);
  const seeded = useMemo(() => seedPoints(recent), [recent]);
  return useMemo(() => mergePoints(seeded, live), [seeded, live]);
}
