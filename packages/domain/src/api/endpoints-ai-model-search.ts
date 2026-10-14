import { z } from 'zod';
import { AI_MODEL_SEARCH, AI_MODEL_SEARCH_SORT } from '../ai-model-search';
import { AI_MODALITY, AI_MODEL_CURSOR, AI_MODEL_KIND, AI_MODEL_MAKER } from '../ai-models';
import { NO_BODY, endpoint } from './endpoint';
import { NOTHING, QUERY_FLAG, queryLimit } from './primitives';

const PRICE_CEILING = z.coerce.number().min(0).max(1_000_000);

export const AI_MODEL_SEARCH_QUERY = z.strictObject({
  kind: AI_MODEL_KIND.optional(),
  q: z.string().trim().min(1).max(80).optional(),
  provider: AI_MODEL_MAKER.optional(),
  sort: AI_MODEL_SEARCH_SORT.default('newest'),
  input_modality: AI_MODALITY.optional(),
  output_modality: AI_MODALITY.optional(),
  min_context: z.coerce.number().int().min(0).optional(),
  max_input_price: PRICE_CEILING.optional(),
  max_output_price: PRICE_CEILING.optional(),
  cursor: AI_MODEL_CURSOR.optional(),
  limit: queryLimit(30, 60),
  gone: QUERY_FLAG.default(false),
});

export type AiModelSearchQuery = z.input<typeof AI_MODEL_SEARCH_QUERY>;
export type AiModelSearchRequest = z.output<typeof AI_MODEL_SEARCH_QUERY>;

export const AI_MODEL_SEARCH_ENDPOINTS = {
  searchAiModels: endpoint({
    method: 'GET',
    path: '/api/ai/model-search',
    access: 'member',
    summary:
      'Search the full visible hub model catalogue with global ordering, directional modalities, known price and context filters, and source availability; native subscription routes are separate',
    params: NOTHING,
    query: AI_MODEL_SEARCH_QUERY,
    body: NO_BODY,
    response: AI_MODEL_SEARCH,
  }),
} as const;
