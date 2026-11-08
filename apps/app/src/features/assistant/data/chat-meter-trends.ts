import { API_ENDPOINTS, type AiChatMeterSample } from '@smarteverything/domain';
import type { UseQueryResult } from '@tanstack/react-query';
import { api } from '../../../api/transport';
import type { ChartPoint } from '../../../components/charts';
import { HOUR_MS, MINUTE_MS } from '../../../format/time';
import { chatMeterHistoryKey } from '../../../queries/keys';
import { useScreenQuery } from '../../../queries/use-screen-query';

export interface MeterTrends {
  readonly context: readonly ChartPoint[];
  readonly cache: readonly ChartPoint[];
  readonly subscription: readonly SubscriptionPoint[];
}

type SubscriptionPoint = ChartPoint & { readonly resetAt: number };

export type UsageDomain = readonly [number, number];

function meterTrends(samples: readonly AiChatMeterSample[]): MeterTrends {
  const points: Record<'context' | 'cache', ChartPoint[]> = { context: [], cache: [] };
  const subscription: SubscriptionPoint[] = [];
  for (const sample of samples) {
    const point = { t: Date.parse(sample.at), v: sample.percent };
    if (sample.kind === 'subscription')
      subscription.push({ ...point, resetAt: Date.parse(sample.resets_at) });
    else points[sample.kind].push(point);
  }
  return { ...points, subscription };
}

export function useChatMeterHistory(chatId: string): UseQueryResult<MeterTrends> {
  return useScreenQuery({
    queryKey: chatMeterHistoryKey(chatId),
    queryFn: ({ signal }) =>
      api().call(API_ENDPOINTS.readAiChatMeterHistory, { params: { chatId } }, { signal }),
    refetchOnMount: 'always',
    select: meterTrends,
  });
}

export function usageTimeDomain(...series: readonly (readonly ChartPoint[])[]): UsageDomain {
  let first = Number.POSITIVE_INFINITY;
  let last = Number.NEGATIVE_INFINITY;
  for (const points of series) {
    for (const point of points) {
      first = Math.min(first, point.t);
      last = Math.max(last, point.t);
    }
  }
  if (!Number.isFinite(last)) return [0, MINUTE_MS];
  return [Math.max(last - HOUR_MS, Math.min(first, last - MINUTE_MS)), last];
}
