import {
  pluginStreamKey,
  type PluginId,
  type PluginStreamRow,
  type WidgetStreamRef,
} from '@smarteverything/domain';
import { useState } from 'react';
import { readPluginStreamHistory } from '../../api/plugins';
import type { ChartPoint } from '../../components/charts/scale';
import { PLUGIN_PREFIX } from '../../queries/keys';
import { useScreenQuery } from '../../queries/use-screen-query';
import { useStoreSelector } from '../../store/store-context';
import { pluginStreamRow } from '../../store/subscriptions';
import {
  appendChartPoint,
  chartPointOf,
  chartPointsOf,
  SERIES_KEPT,
  seriesWindow,
} from './series-model';

interface Seen {
  readonly row: PluginStreamRow | undefined;
  readonly live: readonly ChartPoint[];
}

export function useStreamSeries(
  pluginId: PluginId,
  ref: WidgetStreamRef,
  minutes: number,
): readonly ChartPoint[] {
  const key = pluginStreamKey(pluginId, ref.stream);
  const row = useStoreSelector((state) => pluginStreamRow(state, key), Object.is, [key]);
  const history = useScreenQuery({
    queryKey: [...PLUGIN_PREFIX, pluginId, 'series', ref.stream, ref.field],
    queryFn: async () =>
      chartPointsOf(
        await readPluginStreamHistory(pluginId, ref.stream, SERIES_KEPT),
        pluginId,
        ref,
      ),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const seenAfter = (live: readonly ChartPoint[]): Seen => ({
    row,
    live: appendChartPoint(live, row === undefined ? null : chartPointOf(row, pluginId, ref)),
  });
  const [seen, setSeen] = useState(() => seenAfter([]));
  if (seen.row !== row) setSeen(seenAfter(seen.live));
  return seriesWindow(history.data ?? [], seen.live, minutes);
}
