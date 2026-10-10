import { z } from 'zod';
import { DAY, MOMENT } from './api/primitives';

export const AI_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;

export const AI_EFFORT = z.enum(AI_EFFORTS);

export type AiEffort = z.infer<typeof AI_EFFORT>;

export const AI_MODEL_KINDS = ['chat', 'image', 'video', 'embed', 'transcribe', 'live', 'speak'] as const;

export const AI_MODEL_KIND = z.enum(AI_MODEL_KINDS);

export type AiModelKind = z.infer<typeof AI_MODEL_KIND>;

export const AI_MODEL_PROVIDERS = ['openrouter', 'google'] as const;

export const AI_MODEL_PROVIDER = z.enum(AI_MODEL_PROVIDERS);

export type AiModelProvider = z.infer<typeof AI_MODEL_PROVIDER>;

export const AI_REASONING_MODES = ['none', 'optional', 'mandatory'] as const;

export const AI_REASONING_MODE = z.enum(AI_REASONING_MODES);

export type AiReasoningMode = z.infer<typeof AI_REASONING_MODE>;

export const AI_MODEL_ID = z
  .string()
  .trim()
  .min(3)
  .max(200)
  .regex(/^[\w.~:-]+\/[\w.:@+-]+$|^google:[\w.-]+$/, 'a model id like google/gemini-3.8-flash');

export const AI_MODALITY = z.string().trim().min(1).max(40);

const USD = z.number().min(0).max(1_000_000).nullable();

export const AI_PRICE_TIER = z.strictObject({
  min_prompt_tokens: z.int().min(1),
  input_per_mtok: USD,
  output_per_mtok: USD,
  cache_read_per_mtok: USD,
  cache_write_per_mtok: USD,
});

export type AiPriceTier = z.infer<typeof AI_PRICE_TIER>;

export const AI_PRICING = z.strictObject({
  variable: z.boolean(),
  input_per_mtok: USD,
  output_per_mtok: USD,
  cache_read_per_mtok: USD,
  cache_write_per_mtok: USD,
  reasoning_per_mtok: USD,
  audio_in_per_mtok: USD,
  audio_out_per_mtok: USD,
  video_in_per_mtok: USD,
  image_in_per_mtok: USD,
  image_out_per_mtok: USD,
  per_image_in: USD,
  per_image_out: z.record(z.string().min(1).max(40), z.number().min(0)).nullable(),
  per_request: USD,
  per_web_search: USD,
  per_video_second: z.record(z.string().min(1).max(40), z.number().min(0)).nullable(),
  tiers: z.array(AI_PRICE_TIER).max(10),
});

export type AiPricing = z.infer<typeof AI_PRICING>;

export const NO_PRICES: AiPricing = {
  variable: false,
  input_per_mtok: null,
  output_per_mtok: null,
  cache_read_per_mtok: null,
  cache_write_per_mtok: null,
  reasoning_per_mtok: null,
  audio_in_per_mtok: null,
  audio_out_per_mtok: null,
  video_in_per_mtok: null,
  image_in_per_mtok: null,
  image_out_per_mtok: null,
  per_image_in: null,
  per_image_out: null,
  per_request: null,
  per_web_search: null,
  per_video_second: null,
  tiers: [],
};

export const AI_MODEL_ROW = z.strictObject({
  id: AI_MODEL_ID,
  provider: AI_MODEL_PROVIDER,
  name: z.string().trim().min(1).max(120),
  author: z.string().trim().min(1).max(80),
  author_name: z.string().trim().min(1).max(80),
  family: z.string().trim().min(1).max(120),
  description: z.string().max(4000),
  created: MOMENT,
  context_length: z.int().min(0).nullable(),
  max_output: z.int().min(0).nullable(),
  input_modalities: z.array(AI_MODALITY).max(12),
  output_modalities: z.array(AI_MODALITY).max(12),
  supported_parameters: z.array(z.string().min(1).max(60)).max(80),
  reasoning: AI_REASONING_MODE,
  efforts: z.array(AI_EFFORT),
  default_effort: AI_EFFORT.nullable(),
  tools: z.boolean(),
  alias_of: AI_MODEL_ID.nullable(),
  pricing: AI_PRICING,
  kinds: z.array(AI_MODEL_KIND).min(1),
  expires_at: DAY.nullable(),
  synced_at: MOMENT,
  gone_at: MOMENT.nullable(),
});

export type AiModelRow = z.infer<typeof AI_MODEL_ROW>;

export const AI_MODEL_PRICE_ROW = z.strictObject({
  model_id: AI_MODEL_ID,
  effective_at: MOMENT,
  pricing: AI_PRICING,
});

export type AiModelPriceRow = z.infer<typeof AI_MODEL_PRICE_ROW>;

export const AUTO_LATEST_GEMINI_FLASH = 'auto:latest-gemini-flash';

export const DEFAULT_AI_EFFORT: AiEffort = 'low';

export const AI_MODEL_CHOICE = z.union([z.literal(AUTO_LATEST_GEMINI_FLASH), AI_MODEL_ID]);

export type AiModelChoice = z.infer<typeof AI_MODEL_CHOICE>;

export const OPENROUTER_SETTINGS = z.strictObject({
  default_model: AI_MODEL_CHOICE,
  default_effort: AI_EFFORT,
  google_prices: z.record(AI_MODEL_ID, AI_PRICING),
});

export type OpenRouterSettings = z.infer<typeof OPENROUTER_SETTINGS>;

export const OPENROUTER_DEFAULTS: OpenRouterSettings = {
  default_model: 'openai/gpt-6-luna',
  default_effort: DEFAULT_AI_EFFORT,
  google_prices: {},
};

export const AI_RESOLVED_MODEL = z.strictObject({
  choice: AI_MODEL_CHOICE,
  model_id: AI_MODEL_ID,
  name: z.string().min(1).max(140),
  effort: AI_EFFORT.nullable(),
});

export type AiResolvedModel = z.infer<typeof AI_RESOLVED_MODEL>;

const FLASH_ID = /^google\/gemini-(\d+)(?:\.(\d+))?-flash(-preview(?:-[\w-]+)?)?$/;

const FLASH_LITE_ID = /^google\/gemini-(\d+)(?:\.(\d+))?-flash-lite(-preview(?:-[\w-]+)?)?$/;

interface VersionRank {
  readonly model: AiModelRow;
  readonly version: number;
  readonly stable: boolean;
}

function versionRankOf(model: AiModelRow, pattern: RegExp, kind: AiModelKind): VersionRank | null {
  const match = pattern.exec(model.id);
  if (match === null || model.gone_at !== null || !model.kinds.includes(kind)) {
    return null;
  }
  const version = Number(match[1]) * 1000 + Number(match[2] ?? '0');
  return { model, version, stable: match[3] === undefined };
}

function better(a: VersionRank, b: VersionRank): boolean {
  if (a.version !== b.version) {
    return a.version > b.version;
  }
  if (a.stable !== b.stable) {
    return a.stable;
  }
  return Date.parse(a.model.created) > Date.parse(b.model.created);
}

export function latestVersioned(
  models: readonly AiModelRow[],
  pattern: RegExp,
  kind: AiModelKind,
): AiModelRow | null {
  let best: VersionRank | null = null;
  for (const model of models) {
    const rank = versionRankOf(model, pattern, kind);
    if (rank !== null && (best === null || better(rank, best))) {
      best = rank;
    }
  }
  return best === null ? null : best.model;
}

export function latestGeminiFlash(models: readonly AiModelRow[]): AiModelRow | null {
  return latestVersioned(models, FLASH_ID, 'chat');
}

export function latestGeminiFlashLite(models: readonly AiModelRow[]): AiModelRow | null {
  return latestVersioned(models, FLASH_LITE_ID, 'chat');
}

export function closestEffort(model: AiModelRow, wanted: AiEffort): AiEffort | null {
  if (model.efforts.length === 0) {
    return null;
  }
  if (model.efforts.includes(wanted)) {
    return wanted;
  }
  const target = AI_EFFORTS.indexOf(wanted);
  const ranked = [...model.efforts].sort(
    (a, b) => Math.abs(AI_EFFORTS.indexOf(a) - target) - Math.abs(AI_EFFORTS.indexOf(b) - target),
  );
  return ranked[0] ?? null;
}

export function displayNameOf(model: AiModelRow, choice: AiModelChoice): string {
  return choice === AUTO_LATEST_GEMINI_FLASH ? `${model.name} (latest)` : model.name;
}

export const AI_MODEL_CURSOR = z.string().min(1).max(260);

export const AI_MODEL_LIST = z.strictObject({
  synced_at: MOMENT.nullable(),
  sync_error: z.string().max(400).nullable(),
  default: AI_RESOLVED_MODEL.nullable(),
  models: z.array(AI_MODEL_ROW),
  total: z.int().min(0).optional(),
  next_cursor: AI_MODEL_CURSOR.nullable().optional(),
});

export type AiModelList = z.infer<typeof AI_MODEL_LIST>;

export const AI_MODEL_SUGGESTED = z.strictObject({
  synced_at: MOMENT.nullable(),
  sync_error: z.string().max(400).nullable(),
  default: AI_RESOLVED_MODEL.nullable(),
  default_model: AI_MODEL_ROW.nullable(),
  current: AI_MODEL_ROW.nullable(),
  favourites: z.array(AI_MODEL_ROW),
  recent: z.array(AI_MODEL_ROW).max(6),
  top_picks: z.array(AI_MODEL_ROW),
});

export type AiModelSuggested = z.infer<typeof AI_MODEL_SUGGESTED>;

export const AI_MODEL_MAKER = z.string().trim().min(1).max(80);

export const AI_PROVIDER_COUNT = z.strictObject({
  provider: AI_MODEL_MAKER,
  name: z.string().min(1).max(80),
  count: z.int().min(1),
});

export type AiProviderCount = z.infer<typeof AI_PROVIDER_COUNT>;

export const AI_MODEL_DETAIL = z.strictObject({
  model: AI_MODEL_ROW,
  prices: z.array(AI_MODEL_PRICE_ROW),
});

export type AiModelDetail = z.infer<typeof AI_MODEL_DETAIL>;

export const AI_CATALOGUE_SYNC = z.strictObject({
  synced_at: MOMENT,
  models: z.int().min(0),
  added: z.int().min(0),
  repriced: z.int().min(0),
  gone: z.int().min(0),
  skipped: z.int().min(0),
});

export type AiCatalogueSync = z.infer<typeof AI_CATALOGUE_SYNC>;

export const OPENROUTER_KEY_SOURCES = ['discordinator'] as const;

export const OPENROUTER_KEY_SOURCE = z.enum(OPENROUTER_KEY_SOURCES);

export type OpenRouterKeySource = z.infer<typeof OPENROUTER_KEY_SOURCE>;

export const OPENROUTER_KEY = z
  .string()
  .trim()
  .regex(/^sk-or-[\w-]{20,200}$/, 'an OpenRouter key (starts with sk-or-)');

export const OPENROUTER_STATUS = z.strictObject({
  key: z.enum(['set', 'missing']),
  sources: z.array(OPENROUTER_KEY_SOURCE),
  settings: OPENROUTER_SETTINGS,
  default: AI_RESOLVED_MODEL.nullable(),
  synced_at: MOMENT.nullable(),
  sync_error: z.string().max(400).nullable(),
  models: z.int().min(0),
});

export type OpenRouterStatus = z.infer<typeof OPENROUTER_STATUS>;

export const OPENROUTER_CREDITS = z.discriminatedUnion('state', [
  z.strictObject({
    state: z.literal('known'),
    total: z.number(),
    used: z.number(),
  }),
  z.strictObject({ state: z.literal('needs_management_key') }),
]);

export type OpenRouterCredits = z.infer<typeof OPENROUTER_CREDITS>;

export const OPENROUTER_ACCOUNT = z.strictObject({
  label: z.string().max(200),
  limit: z.number().nullable(),
  limit_remaining: z.number().nullable(),
  limit_reset: z.string().max(40).nullable(),
  usage: z.number(),
  usage_daily: z.number(),
  usage_weekly: z.number(),
  usage_monthly: z.number(),
  free_tier: z.boolean(),
  credits: OPENROUTER_CREDITS,
  checked_at: MOMENT,
});

export type OpenRouterAccount = z.infer<typeof OPENROUTER_ACCOUNT>;

export const OPENROUTER_TOP_UP_URL = 'https://openrouter.ai/settings/credits';
