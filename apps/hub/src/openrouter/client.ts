import type { z } from 'zod';
import type { ChatChunk, ChatRequest, Credits, GenerationStats, KeyInfo } from './chat-types';
import { errorCodeOf, openRouterError, OpenRouterError, readJson } from './errors';
import { sseData } from './sse';
import { ChunkReader } from './stream';
import {
  OR_CREDITS,
  OR_ERROR,
  OR_GENERATION,
  OR_IMAGE_ENDPOINTS,
  OR_IMAGE_MODELS,
  OR_KEY,
  OR_MODELS,
  OR_VIDEO_MODELS,
  type OrImageModel,
  type OrImagePrice,
  type OrModel,
  type OrVideoModel,
} from './wire';

export const OPENROUTER_API = 'https://openrouter.ai/api/v1';

const REFERER = 'https://github.com/DevL0rd/SmartEverything';
const TITLE = 'SmartEverything';
const TIMEOUT_MS = 20_000;

export interface OpenRouterClientOptions {
  readonly fetch: typeof fetch;
  readonly key: () => string | null;
}

export interface OpenRouterCall {
  readonly path: string;
  readonly method?: 'GET' | 'POST';
  readonly body?: unknown;
  readonly key?: string | null;
  readonly signal?: AbortSignal;
}

function requestBody(req: ChatRequest): Record<string, unknown> {
  return {
    model: req.model,
    messages: req.messages,
    stream: true,
    usage: { include: true },
    ...(req.tools === undefined || req.tools.length === 0
      ? {}
      : { tools: req.tools, tool_choice: req.toolChoice ?? 'auto' }),
    ...(req.parallelToolCalls === undefined ? {} : { parallel_tool_calls: req.parallelToolCalls }),
    ...(req.effort === null ? {} : { reasoning: { effort: req.effort } }),
    ...(req.maxTokens === undefined ? {} : { max_tokens: req.maxTokens }),
    ...(req.user === undefined ? {} : { user: req.user }),
    ...(req.sessionId === undefined ? {} : { session_id: req.sessionId }),
    ...(req.cacheControl === true ? { cache_control: { type: 'ephemeral' } } : {}),
  };
}

async function failureOf(response: Response): Promise<OpenRouterError> {
  const text = await response.text();
  const json = readJson(text);
  const parsed = json.ok ? OR_ERROR.safeParse(json.value) : null;
  const detail =
    parsed?.success === true
      ? parsed.data.error.message.slice(0, 200)
      : `HTTP ${String(response.status)}, ${text.slice(0, 80)}`;
  return openRouterError(errorCodeOf(response.status), detail, response.status);
}

function readAs<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue === undefined ? what : `${what} ${issue.path.join('.')}: ${issue.message}`;
    throw openRouterError('unreadable', where);
  }
  return parsed.data;
}

export class OpenRouterClient {
  constructor(private readonly options: OpenRouterClientOptions) {}

  async *chat(req: ChatRequest, signal: AbortSignal): AsyncGenerator<ChatChunk> {
    const response = await this.send({
      path: '/chat/completions',
      method: 'POST',
      body: requestBody(req),
      signal,
    });
    if (response.body === null) {
      throw openRouterError('unreadable', 'empty stream');
    }
    const reader = new ChunkReader();
    let finished = false;
    for await (const data of sseData(response.body, signal)) {
      for (const chunk of reader.read(data)) {
        finished ||= chunk.type === 'usage';
        yield chunk;
      }
    }
    if (!finished && !signal.aborted) {
      throw openRouterError('unavailable', 'the answer stopped before it finished');
    }
  }

  async models(): Promise<OrModel[]> {
    return (await this.json({ path: '/models', key: null }, OR_MODELS, 'model list')).data;
  }

  async videoModels(): Promise<OrVideoModel[]> {
    return (await this.json({ path: '/videos/models', key: null }, OR_VIDEO_MODELS, 'video list'))
      .data;
  }

  async imageModels(): Promise<OrImageModel[]> {
    return (await this.json({ path: '/images/models', key: null }, OR_IMAGE_MODELS, 'image list'))
      .data;
  }

  async imagePrices(model: OrImageModel): Promise<OrImagePrice[] | null> {
    const path = model.endpoints.replace(/^\/api\/v1/, '');
    const answer = await this.json({ path, key: null }, OR_IMAGE_ENDPOINTS, 'image prices');
    const [first] = answer.endpoints;
    return first === undefined ? null : first.pricing;
  }

  async generation(id: string): Promise<GenerationStats> {
    const path = `/generation?id=${encodeURIComponent(id)}`;
    const { data } = await this.json({ path }, OR_GENERATION, 'generation');
    return {
      id: data.id,
      model: data.model,
      totalCost: data.total_cost,
      cacheDiscount: data.cache_discount,
      upstreamInferenceCost: data.upstream_inference_cost,
      tokensPrompt: data.tokens_prompt,
      tokensCompletion: data.tokens_completion,
      nativeTokensPrompt: data.native_tokens_prompt,
      nativeTokensCompletion: data.native_tokens_completion,
      nativeTokensReasoning: data.native_tokens_reasoning,
      nativeTokensCached: data.native_tokens_cached,
      nativeTokensCompletionImages: data.native_tokens_completion_images,
      numMediaPrompt: data.num_media_prompt,
      numMediaCompletion: data.num_media_completion,
      numInputAudioPrompt: data.num_input_audio_prompt,
      numSearchResults: data.num_search_results,
      providerName: data.provider_name,
      finishReason: data.finish_reason,
      latencyMs: data.latency,
      generationTimeMs: data.generation_time,
      createdAt: data.created_at,
      isByok: data.is_byok,
    };
  }

  async key(candidate?: string): Promise<KeyInfo> {
    const call: OpenRouterCall =
      candidate === undefined ? { path: '/key' } : { path: '/key', key: candidate };
    const { data } = await this.json(call, OR_KEY, 'key info');
    return {
      label: data.label,
      limit: data.limit,
      limitRemaining: data.limit_remaining,
      limitReset: data.limit_reset,
      usage: data.usage,
      usageDaily: data.usage_daily,
      usageWeekly: data.usage_weekly,
      usageMonthly: data.usage_monthly,
      freeTier: data.is_free_tier,
    };
  }

  async credits(): Promise<Credits> {
    const { data } = await this.json({ path: '/credits' }, OR_CREDITS, 'credits');
    return { total: data.total_credits, used: data.total_usage };
  }

  async json<T>(call: OpenRouterCall, schema: z.ZodType<T>, what: string): Promise<T> {
    const response = await this.send(call);
    const json = readJson(await response.text());
    if (!json.ok) {
      throw openRouterError('unreadable', `${what} wasn’t JSON: ${json.reason}`);
    }
    return readAs(schema, json.value, what);
  }

  private headersOf(call: OpenRouterCall): Record<string, string> {
    const key = call.key === undefined ? this.options.key() : call.key;
    if (key === null && call.key === undefined) {
      throw openRouterError('no_key', null);
    }
    return {
      'HTTP-Referer': REFERER,
      'X-Title': TITLE,
      ...(key === null ? {} : { Authorization: `Bearer ${key}` }),
      ...(call.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    };
  }

  async send(call: OpenRouterCall): Promise<Response> {
    const headers = this.headersOf(call);
    const signal = call.signal ?? AbortSignal.timeout(TIMEOUT_MS);
    let response: Response;
    try {
      response = await this.options.fetch(`${OPENROUTER_API}${call.path}`, {
        method: call.method ?? 'GET',
        headers,
        signal,
        ...(call.body === undefined ? {} : { body: JSON.stringify(call.body) }),
      });
    } catch (cause) {
      if (cause instanceof OpenRouterError) {
        throw cause;
      }
      const reason = cause instanceof Error ? cause.message : String(cause);
      throw openRouterError('unavailable', `couldn’t reach OpenRouter: ${reason}`);
    }
    if (!response.ok) {
      throw await failureOf(response);
    }
    return response;
  }
}
