import type { BrushLiveFrame, BrushReadQuery, BrushStateView } from '@smarteverything/domain';
import type { UseQueryResult } from '@tanstack/react-query';
import { readBrushView, type BrushViewOf } from '../../../api/toothbrushes';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { useLiveDemand } from '../../../store/use-live-demand';
import { newerFrame } from '../model/live-frame';
import { brushKey } from './brush-keys';
import { useBrushLive } from './brush-live';

const LIVE_TOPICS = ['live'] as const;

export function useBrushView<K extends BrushReadQuery['view']>(
  deviceId: string,
  kind: K,
  query: Omit<BrushReadQuery, 'view'> = {},
  enabled = true,
): UseQueryResult<BrushViewOf<K>> {
  return useScreenQuery({
    queryKey: brushKey(deviceId, { ...query, view: kind }),
    queryFn: () => readBrushView(deviceId, kind, query),
    enabled,
    staleTime: Infinity,
  });
}

export function useBrushState(deviceId: string): UseQueryResult<BrushStateView> {
  return useBrushView(deviceId, 'state');
}

export function useBrushDemand(deviceId: string, onScreen = true): void {
  useLiveDemand(deviceId, LIVE_TOPICS, undefined, onScreen);
}

export function useFrame(deviceId: string, loaded: BrushLiveFrame): BrushLiveFrame {
  return useBrushLive(deviceId, (live) => newerFrame(live.frame, loaded));
}

export function useFrameSelect<T>(
  deviceId: string,
  loaded: BrushLiveFrame,
  pick: (frame: BrushLiveFrame) => T,
): T {
  return useBrushLive(deviceId, (live) => pick(newerFrame(live.frame, loaded)));
}
