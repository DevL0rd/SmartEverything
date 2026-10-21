import {
  AI_EFFORT,
  AI_MODEL_CHOICE,
  AI_MODEL_CURSOR,
  AI_MODEL_DETAIL,
  AI_MODEL_ID,
  AI_MODEL_KIND,
  AI_MODEL_LIST,
  AI_MODEL_MAKER,
  AI_CATALOGUE_SYNC,
  OPENROUTER_STATUS,
  type AiModelRow,
  type AiPricing,
} from '@smarteverything/domain';
import { z } from 'zod';
import { operate } from './acting';
import { READS, WRITES, defineTool, type Tool } from './registry';

const LIST_INPUT = z.strictObject({
  kind: AI_MODEL_KIND.optional().describe(
    'Only models for chat, image, video, embed, transcribe or live (voice)',
  ),
  q: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .optional()
    .describe('Words to match in the name, maker or id, e.g. "gemini flash"'),
  provider: AI_MODEL_MAKER.optional().describe(
    'Only this maker, e.g. google, anthropic, openai (see operation_call listAiModelProviders)',
  ),
  gone: z.boolean().default(false).describe('Include models OpenRouter no longer offers'),
  limit: z.int().min(1).max(60).default(30).describe('Most models to return, newest first'),
  cursor: AI_MODEL_CURSOR.optional().describe('next_cursor from the previous page'),
});

function pricesOf(pricing: AiPricing): Record<string, unknown> {
  const listed = Object.entries({
    variable: pricing.variable ? true : null,
    input_per_mtok: pricing.input_per_mtok,
    output_per_mtok: pricing.output_per_mtok,
    cache_read_per_mtok: pricing.cache_read_per_mtok,
    audio_in_per_mtok: pricing.audio_in_per_mtok,
    audio_out_per_mtok: pricing.audio_out_per_mtok,
    image_out_per_mtok: pricing.image_out_per_mtok,
    per_image_out: pricing.per_image_out,
    per_video_second: pricing.per_video_second,
    per_request: pricing.per_request,
  });
  return Object.fromEntries(listed.filter(([, value]) => value !== null));
}

function summaryOf(model: AiModelRow): Record<string, unknown> {
  return {
    id: model.id,
    name: model.name,
    maker: model.author_name,
    billed_by: model.provider,
    kinds: model.kinds,
    context_length: model.context_length,
    input: model.input_modalities,
    thinking: model.efforts,
    tools: model.tools,
    usd: pricesOf(model.pricing),
    ...(model.gone_at === null ? {} : { gone_at: model.gone_at }),
  };
}

export const AI_MODEL_TOOLS: readonly Tool[] = [
  defineTool({
    name: 'list_models',
    input: LIST_INPUT,
    annotations: READS,
    run: async (context, input) => {
      const query = {
        gone: String(input.gone),
        limit: String(input.limit),
        ...(input.kind === undefined ? {} : { kind: input.kind }),
        ...(input.q === undefined ? {} : { q: input.q }),
        ...(input.provider === undefined ? {} : { provider: input.provider }),
        ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
      };
      const list = AI_MODEL_LIST.parse(await operate(context, 'listAiModels', { query }));
      return {
        structured: {
          synced_at: list.synced_at,
          sync_error: list.sync_error,
          default: list.default,
          matching: list.total,
          next_cursor: list.next_cursor,
          models: list.models.map(summaryOf),
        },
      };
    },
  }),
  defineTool({
    name: 'get_model',
    input: z.strictObject({
      id: AI_MODEL_ID.describe('Model id from model_read view list'),
    }),
    annotations: READS,
    run: async (context, input) => {
      const detail = AI_MODEL_DETAIL.parse(
        await operate(context, 'readAiModel', { params: { id: input.id } }),
      );
      return {
        structured: { model: detail.model, price_history: detail.prices },
      };
    },
  }),
  defineTool({
    name: 'refresh_models',
    input: z.strictObject({}),
    annotations: { ...WRITES, idempotentHint: true, openWorldHint: true },
    run: async (context) => ({
      structured: AI_CATALOGUE_SYNC.parse(await operate(context, 'refreshAiModels', {})),
    }),
  }),
  defineTool({
    name: 'get_ai_defaults',
    input: z.strictObject({}),
    annotations: READS,
    run: async (context) => ({
      structured: OPENROUTER_STATUS.parse(await operate(context, 'readOpenRouter', {})),
    }),
  }),
  defineTool({
    name: 'set_ai_defaults',
    input: z.strictObject({
      model: AI_MODEL_CHOICE.describe(
        'auto:latest-gemini-flash (follows new releases) or a chat model id from model_read view list',
      ),
      thinking: AI_EFFORT.describe('Thinking level; clamped to what the model supports'),
    }),
    annotations: { ...WRITES, idempotentHint: true },
    run: async (context, input) => ({
      structured: OPENROUTER_STATUS.parse(
        await operate(context, 'setOpenRouterDefaults', {
          body: { default_model: input.model, default_effort: input.thinking },
        }),
      ),
    }),
  }),
];
