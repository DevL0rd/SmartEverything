import type { BottleReadQuery, BottleStatusView } from '@smarteverything/domain';
import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useEffect } from 'react';
import { background } from '@smarteverything/logging';
import { readBottleView, type BottleViewOf } from '../../../api/bottles';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { useDeviceDerived } from '../../../store/selectors';
import { bottleKey, bottlePrefix } from './bottle-keys';

const WATCHED = ['bottle_link', 'last_seen', 'last_drink', 'bottle_state', 'battery'] as const;

function useRefreshOnState(deviceId: string): void {
  const client = useQueryClient();
  const stamp = useDeviceDerived(
    deviceId,
    (values) => WATCHED.map((key) => `${key}:${values[key]?.observedAt ?? ''}`).join('|'),
    [],
    Object.is,
  );
  useEffect(() => {
    background(
      client.invalidateQueries({ queryKey: bottlePrefix(deviceId) }),
      'queries.invalidate_failed',
    );
  }, [client, deviceId, stamp]);
}

export function useBottleView<K extends BottleReadQuery['view']>(
  deviceId: string,
  kind: K,
  query: Omit<BottleReadQuery, 'view'> = {},
  enabled = true,
): UseQueryResult<BottleViewOf<K>> {
  return useScreenQuery({
    queryKey: bottleKey(deviceId, { ...query, view: kind }),
    queryFn: () => readBottleView(deviceId, kind, query),
    enabled,
    staleTime: Infinity,
  });
}

export function useBottleStatus(deviceId: string): UseQueryResult<BottleStatusView> {
  useRefreshOnState(deviceId);
  return useBottleView(deviceId, 'status');
}
