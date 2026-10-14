import { AI_MODEL_SEARCH_SOURCE, type AiModelSearchSource } from '@smarteverything/domain';
import { z } from 'zod';

const MODEL_ORDER = z.strictObject({
  source: AI_MODEL_SEARCH_SOURCE.strict(),
  ranks: z.record(z.string().min(1).max(200), z.int().min(0)),
});

export const MODEL_SEARCH_STATE = z.strictObject({
  intelligence: MODEL_ORDER,
  latency: MODEL_ORDER,
});

export type ModelSearchState = z.infer<typeof MODEL_SEARCH_STATE>;
export type ModelOrder = z.infer<typeof MODEL_ORDER>;
export type ModelMetric = keyof ModelSearchState;

export const METRIC_SORTS = {
  intelligence: 'intelligence-high-to-low',
  latency: 'latency-low-to-high',
} as const;

const MODEL_DOCS =
  'https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties';

function unavailable(metric: ModelMetric): ModelOrder {
  return {
    ranks: {},
    source: {
      status: 'unavailable',
      source: `openrouter/${METRIC_SORTS[metric]}`,
      method: 'upstream-order',
      coverage: metric === 'intelligence' ? 'scored-models' : 'upstream-catalogue',
      total: null,
      checked_at: null,
      as_of: null,
      version: null,
      source_url: MODEL_DOCS,
      error: 'Upstream ordering has not been acquired yet.',
    },
  };
}

export const EMPTY_MODEL_SEARCH_STATE: ModelSearchState = {
  intelligence: unavailable('intelligence'),
  latency: unavailable('latency'),
};

const FRESHNESS_MS = 86_400_000;

export function freshMetricSource(source: AiModelSearchSource, now: number): AiModelSearchSource {
  if (
    source.status === 'available' &&
    source.checked_at !== null &&
    now - Date.parse(source.checked_at) > FRESHNESS_MS
  ) {
    return { ...source, status: 'stale' };
  }
  return source;
}
