import { z } from "zod";
import {
  AI_CATALOGUE_SYNC,
  AI_EFFORT,
  AI_MODEL_CHOICE,
  AI_MODEL_CURSOR,
  AI_MODEL_DETAIL,
  AI_MODEL_ID,
  AI_MODEL_KIND,
  AI_MODEL_LIST,
  AI_MODEL_MAKER,
  AI_MODEL_SUGGESTED,
  AI_PRICING,
  AI_PROVIDER_COUNT,
  OPENROUTER_ACCOUNT,
  OPENROUTER_KEY,
  OPENROUTER_KEY_SOURCE,
  OPENROUTER_STATUS,
} from "../ai-models";
import { NO_BODY, endpoint } from "./endpoint";
import { NOTHING, QUERY_FLAG, queryLimit } from "./primitives";

export const AI_MODEL_QUERY = z.strictObject({
  kind: AI_MODEL_KIND.optional(),
  q: z.string().trim().min(1).max(80).optional(),
  provider: AI_MODEL_MAKER.optional(),
  cursor: AI_MODEL_CURSOR.optional(),
  limit: queryLimit(30, 60),
  gone: QUERY_FLAG.default(false),
});

export const AI_SUGGESTED_QUERY = z.strictObject({
  kind: AI_MODEL_KIND.default("chat"),
  current: AI_MODEL_CHOICE.optional(),
});

export type AiSuggestedQuery = z.input<typeof AI_SUGGESTED_QUERY>;

export type AiModelQuery = z.input<typeof AI_MODEL_QUERY>;

export const OPENROUTER_DEFAULTS_CHANGE = z.strictObject({
  default_model: AI_MODEL_CHOICE,
  default_effort: AI_EFFORT,
});

export type OpenRouterDefaultsChange = z.infer<
  typeof OPENROUTER_DEFAULTS_CHANGE
>;

export const AI_PRICE_OVERRIDE = z.strictObject({
  pricing: AI_PRICING.nullable(),
});

export const AI_MODEL_ENDPOINTS = {
  listAiModels: endpoint({
    method: "GET",
    path: "/api/ai/models",
    access: "member",
    summary:
      "AI models with prices, newest first, a page at a time; filtered by kind, maker and search words, plus the resolved default model",
    params: NOTHING,
    query: AI_MODEL_QUERY,
    body: NO_BODY,
    response: AI_MODEL_LIST,
  }),
  suggestedAiModels: endpoint({
    method: "GET",
    path: "/api/ai/models/suggested",
    access: "member",
    summary:
      "Models to offer first: the current and default model, the caller’s favourites and recent models, and the newest of each major family",
    params: NOTHING,
    query: AI_SUGGESTED_QUERY,
    body: NO_BODY,
    response: AI_MODEL_SUGGESTED,
  }),
  listAiModelProviders: endpoint({
    method: "GET",
    path: "/api/ai/models/providers",
    access: "member",
    summary: "Model makers with how many models each offers, most first",
    params: NOTHING,
    query: z.strictObject({ kind: AI_MODEL_KIND.optional() }),
    body: NO_BODY,
    response: z.array(AI_PROVIDER_COUNT),
  }),
  readAiModel: endpoint({
    method: "GET",
    path: "/api/ai/models/:id",
    access: "member",
    summary: "One AI model with its price history",
    params: z.strictObject({ id: AI_MODEL_ID }),
    query: NOTHING,
    body: NO_BODY,
    response: AI_MODEL_DETAIL,
  }),
  refreshAiModels: endpoint({
    method: "POST",
    path: "/api/ai/models/refresh",
    access: "owner",
    summary: "Download the OpenRouter model list and prices now",
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: AI_CATALOGUE_SYNC,
  }),
  setAiModelPrice: endpoint({
    method: "PUT",
    path: "/api/ai/models/:id/price",
    access: "owner",
    summary:
      "Override the price of a Google model, or clear the override with null",
    params: z.strictObject({ id: AI_MODEL_ID }),
    query: NOTHING,
    body: AI_PRICE_OVERRIDE,
    response: AI_MODEL_DETAIL,
  }),
  readOpenRouter: endpoint({
    method: "GET",
    path: "/api/ai/openrouter",
    access: "member",
    summary:
      "Whether OpenRouter has a key, the default model and thinking, and catalogue state",
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: OPENROUTER_STATUS,
  }),
  setOpenRouterDefaults: endpoint({
    method: "PUT",
    path: "/api/ai/openrouter/defaults",
    access: "owner",
    summary: "Choose the model and thinking level new chats start with",
    params: NOTHING,
    query: NOTHING,
    body: OPENROUTER_DEFAULTS_CHANGE,
    response: OPENROUTER_STATUS,
  }),
  setOpenRouterKey: endpoint({
    method: "PUT",
    path: "/api/ai/openrouter/key",
    access: "owner",
    summary: "Save an OpenRouter key, after checking it works",
    params: NOTHING,
    query: NOTHING,
    body: z.strictObject({ key: OPENROUTER_KEY }),
    response: OPENROUTER_STATUS,
  }),
  importOpenRouterKey: endpoint({
    method: "POST",
    path: "/api/ai/openrouter/key/import",
    access: "owner",
    summary:
      "Copy the OpenRouter key from Discordinator on this computer, after checking it works",
    params: NOTHING,
    query: NOTHING,
    body: z.strictObject({ source: OPENROUTER_KEY_SOURCE }),
    response: OPENROUTER_STATUS,
  }),
  removeOpenRouterKey: endpoint({
    method: "DELETE",
    path: "/api/ai/openrouter/key",
    access: "owner",
    summary: "Forget the OpenRouter key",
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: OPENROUTER_STATUS,
  }),
  readOpenRouterAccount: endpoint({
    method: "GET",
    path: "/api/ai/openrouter/account",
    access: "owner",
    summary: "OpenRouter spending, limit and credits for the saved key",
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: OPENROUTER_ACCOUNT,
  }),
} as const;
