import type { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import { OPENROUTER_API, type OpenRouterClient } from './client';
import {
  METRIC_SORTS,
  type ModelMetric,
  type ModelOrder,
  type ModelSearchState,
} from './model-search-state';
import { messageOf } from '@smarteverything/logging';

const ORDER_RESPONSE = z.looseObject({
  data: z.array(z.looseObject({ id: z.string().min(1).max(200) })),
  total_count: z.int().min(0),
  links: z.looseObject({ next: z.string().nullable() }).optional(),
});

interface OrderSyncOptions {
  readonly client: OpenRouterClient;
  readonly log: Logger;
  readonly at: string;
}

function pathOf(next: string): string {
  const url = new URL(next, OPENROUTER_API);
  return `${url.pathname.replace(/^\/api\/v1/, '')}${url.search}`;
}

async function acquireOrder(
  options: OrderSyncOptions,
  metric: ModelMetric,
  previous: ModelOrder,
): Promise<ModelOrder> {
  const params = new URLSearchParams({ sort: METRIC_SORTS[metric], output_modalities: 'all' });
  if (metric === 'intelligence') params.set('min_intelligence_index', '0');
  const ids: string[] = [];
  let total = 0;
  let path: string | null = `/models?${params.toString()}`;
  while (path !== null) {
    const page: z.infer<typeof ORDER_RESPONSE> = await options.client.json(
      { path, key: null },
      ORDER_RESPONSE,
      `${metric} full model order`,
    );
    ids.push(...page.data.map((row) => row.id));
    total = page.total_count;
    const next: string | null = page.links?.next ?? null;
    path = next === null ? null : pathOf(next);
  }
  return {
    ranks: Object.fromEntries([...new Set(ids)].map((id, rank) => [id, rank])),
    source: {
      ...previous.source,
      status: 'available',
      checked_at: options.at,
      total,
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
        error: messageOf(cause).slice(0, 400),
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
