import { useMemo } from 'react';
import { HOUR_MS } from '../../../format/time';
import { deviceHistoryKey } from '../../../queries/keys';
import { readDeviceRows } from '../../../queries/history';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { onSegments, type OnSegment } from './relay-model';

const HOURS = 24;

export interface PowerTimeline {
  readonly segments: readonly OnSegment[];
  readonly from: number;
  readonly to: number;
}

export function usePowerTimeline(
  deviceId: string,
  capability: string | null,
  enabled: boolean,
): PowerTimeline {
  const rows = useScreenQuery({
    queryKey: deviceHistoryKey(deviceId, capability ?? 'power', HOURS),
    queryFn: () => readDeviceRows(deviceId, capability ?? 'power', HOURS),
    enabled: enabled && capability !== null,
  });
  return useMemo(() => {
    const to = rows.dataUpdatedAt;
    const from = to - HOURS * HOUR_MS;
    return { segments: onSegments(rows.data ?? [], { from, to }), from, to };
  }, [rows.data, rows.dataUpdatedAt]);
}
