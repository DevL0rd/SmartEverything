import { z } from 'zod';
import { AI_MODEL_ID, AI_MODEL_ROW, AI_RESOLVED_MODEL } from './ai-models';
import { MOMENT } from './api/primitives';

export const AI_MODEL_SEARCH_SORT = z.enum([
  'newest',
  'name',
  'intelligence',
  'latency',
  'input-price',
  'output-price',
  'context',
]);

export type AiModelSearchSort = z.infer<typeof AI_MODEL_SEARCH_SORT>;

export const AI_MODEL_SEARCH_METRICS = z.object({
  intelligence_index: z.number().min(0).nullable(),
  intelligence_rank: z.int().min(0).nullable(),
  latency_ms: z.number().min(0).nullable(),
  latency_rank: z.int().min(0).nullable(),
});

export type AiModelSearchMetrics = z.infer<typeof AI_MODEL_SEARCH_METRICS>;

export const AI_MODEL_SEARCH_SOURCE = z.object({
  status: z.enum(['available', 'stale', 'unavailable']),
  source: z.string().min(1).max(120),
  method: z.literal('upstream-order'),
  coverage: z.enum(['scored-models', 'upstream-catalogue']),
  total: z.int().min(0).nullable(),
  checked_at: MOMENT.nullable(),
  as_of: MOMENT.nullable(),
  version: z.string().max(120).nullable(),
  source_url: z.url(),
  error: z.string().max(400).nullable(),
});

export type AiModelSearchSource = z.infer<typeof AI_MODEL_SEARCH_SOURCE>;

export const AI_MODEL_SEARCH_SOURCES = z.object({
  intelligence: AI_MODEL_SEARCH_SOURCE,
  latency: AI_MODEL_SEARCH_SOURCE,
});

export type AiModelSearchSources = z.infer<typeof AI_MODEL_SEARCH_SOURCES>;

export const AI_MODEL_SEARCH = z.object({
  version: z.literal(1),
  scope: z.literal('hub-catalogue'),
  synced_at: MOMENT.nullable(),
  sync_error: z.string().max(400).nullable(),
  default: AI_RESOLVED_MODEL.nullable(),
  models: z.array(AI_MODEL_ROW),
  metrics: z.record(AI_MODEL_ID, AI_MODEL_SEARCH_METRICS),
  sources: AI_MODEL_SEARCH_SOURCES,
  total: z.int().min(0),
  next_cursor: z.string().min(1).max(260).nullable(),
});

export type AiModelSearch = z.infer<typeof AI_MODEL_SEARCH>;

export function matchesModelSearchWords(
  model: Pick<z.infer<typeof AI_MODEL_ROW>, 'id' | 'name' | 'author_name'>,
  query: string,
): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = `${model.name} ${model.author_name} ${model.id}`.toLowerCase();
  return words.every((word) => haystack.includes(word));
}
