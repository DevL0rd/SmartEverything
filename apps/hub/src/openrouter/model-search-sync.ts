import type { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import type { OpenRouterClient } from './client';
import {
  METRIC_SORTS,
  type ModelMetric,
  type ModelOrder,
  type ModelSearchState,
} from './model-search-state';

const ORDER_RESPONSE = z.looseObject({
  data: z.array(z.looseObject({ id: z.string().min(1).max(200) })),
  total_count: z.int().min(0),
  links: z.looseObject({ next: z.null() }),
});

class IncompleteModelOrderError extends Error {
  override readonly name = 'IncompleteModelOrderError';

  constructor(
    readonly metric: ModelMetric,
    readonly received: number,
    readonly expected: number,
  ) {
    super(
      `OpenRouter ${metric} order contained ${String(received)} of ${String(expected)} models.`,
    );
  }
}

interface OrderSyncOptions {
  readonly client: OpenRouterClient;
  readonly log: Logger;
  readonly at: string;
}

async function acquireOrder(
  options: OrderSyncOptions,
  metric: ModelMetric,
  previous: ModelOrder,
): Promise<ModelOrder> {
  const params = new URLSearchParams({ sort: METRIC_SORTS[metric], output_modalities: 'all' });
  if (metric === 'intelligence') params.set('min_intelligence_index', '0');
  const answer = await options.client.json(
    { path: `/models?${params.toString()}`, key: null },
    ORDER_RESPONSE,
    `${metric} full model order`,
  );
  const ids = answer.data.map((row) => row.id);
  if (ids.length !== answer.total_count || new Set(ids).size !== ids.length) {
    throw new IncompleteModelOrderError(metric, new Set(ids).size, answer.total_count);
  }
  return {
    ranks: Object.fromEntries(ids.map((id, rank) => [id, rank])),
    source: {
      ...previous.source,
      status: 'available',
      checked_at: options.at,
      total: answer.total_count,
      error: null,
    },
  };
}

async function syncOrder(
  options: OrderSyncOptions,
  metric: ModelMetric,
  previous: ModelOrder,
): Promise<ModelOrder> {
  try {
    return await acquireOrder(options, metric, previous);
  } catch (cause) {
    options.log.warn('ai_models.metric_unavailable', { metric });
    return {
      ...previous,
      source: {
        ...previous.source,
        status: previous.source.checked_at === null ? 'unavailable' : 'stale',
        error: (cause instanceof Error ? cause.message : String(cause)).slice(0, 400),
      },
    };
  }
}

export async function syncModelSearch(
  options: OrderSyncOptions,
  previous: ModelSearchState,
): Promise<ModelSearchState> {
  const [intelligence, latency] = await Promise.all([
    syncOrder(options, 'intelligence', previous.intelligence),
    syncOrder(options, 'latency', previous.latency),
  ]);
  return { intelligence, latency };
}
