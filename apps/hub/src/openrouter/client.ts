import { Logger, describeFailure } from '@smarteverything/logging';
import type { z } from 'zod';
import { IMAGE_OUTPUT_BYTES_MAX } from '@smarteverything/domain';
import { OPENROUTER_WEB_SEARCH_TOOL } from '../assistant/web-search';
import type { ChatRequest, Credits, GenerationStats, KeyInfo } from './chat-types';
import {
  errorCodeOf,
  networkFailure,
  openRouterError,
  OpenRouterError,
  readAs,
  readJson,
} from './errors';
import { IMAGE_ENDPOINTS_WIRE, type ImageEndpointWire } from './image-wire';
import { sseData } from './sse';
import { retryTransient } from './transient';
import { parseChunk } from './stream';
import { responseText } from './response';
import {
  OR_CREDITS,
  OR_ERROR,
  OR_GENERATION,
  OR_IMAGE_ENDPOINTS,
  OR_IMAGE_MODELS,
  OR_KEY,
  OR_MODELS,
  OR_VIDEO_MODELS,
  type OrChunk,
  type OrImageModel,
  type OrImagePrice,
  type OrModel,
  type OrVideoModel,
} from './wire';

const log = new Logger('hub.openrouter');

export const OPENROUTER_API = 'https://openrouter.ai/api/v1';

const REFERER = 'https://github.com/DevL0rd/SmartEverything';
const TITLE = 'SmartEverything';
const TIMEOUT_MS = 20_000;
const IMAGE_STREAM_IDLE_MS = 120_000;
const IMAGE_RESPONSE_BYTES_MAX = Math.ceil(IMAGE_OUTPUT_BYTES_MAX / 3) * 4 + 1024 * 1024;

export interface OpenRouterClientOptions {
  readonly fetch: typeof fetch;
  readonly key: () => string | null;
  readonly shutdown?: AbortSignal;
}

export interface OpenRouterCall {
  readonly path: string;
  readonly method?: 'GET' | 'POST';
  readonly body?: unknown;
  readonly key?: string | null;
  readonly signal?: AbortSignal;
  readonly responseBytesMax?: number;
}

function wireMessages(req: ChatRequest): readonly unknown[] {
  const [first, ...rest] = req.messages;
  if (req.prefixBreakpoint !== true || first?.role !== 'system') {
    return req.messages;
  }
  const marked = [{ type: 'text', text: first.content, cache_control: { type: 'ephemeral' } }];
  return [{ role: 'system', content: marked }, ...rest];
}

function toolFields(req: ChatRequest): Record<string, unknown> {
  const tools = [
    ...(req.tools ?? []),
    ...(req.webSearch === true ? [OPENROUTER_WEB_SEARCH_TOOL] : []),
  ];
  return tools.length === 0 ? {} : { tools, tool_choice: req.toolChoice ?? 'auto' };
}

function requestBody(req: ChatRequest): Record<string, unknown> {
  return {
    model: req.model,
    messages: wireMessages(req),
    stream: true,
    usage: { include: true },
    ...toolFields(req),
    ...(req.parallelToolCalls === undefined ? {} : { parallel_tool_calls: req.parallelToolCalls }),
    ...(req.effort === null ? {} : { reasoning: { effort: req.effort } }),
    ...(req.maxTokens === undefined ? {} : { max_tokens: req.maxTokens }),
    ...(req.user === undefined ? {} : { user: req.user }),
    ...(req.sessionId === undefined ? {} : { session_id: req.sessionId }),
    ...(req.cacheControl === true ? { cache_control: { type: 'ephemeral' } } : {}),
  };
}

async function failureOf(response: Response, limit?: number): Promise<OpenRouterError> {
  const text = await responseText(response, limit).catch((cause: unknown) => {
    log.debug('error_body.unreadable', () => ({
      status: response.status,
      error: describeFailure(cause).message,
    }));
    return '';
  });
  const json = readJson(text);
  const parsed = json.ok ? OR_ERROR.safeParse(json.value) : null;
  const detail =
    parsed?.success === true
      ? parsed.data.error.message.slice(0, 200)
      : `HTTP ${String(response.status)}, ${text.slice(0, 80)}`;
  return openRouterError(
    errorCodeOf(response.status),
    detail,
    response.status,
    retryAfterOf(response.headers.get('retry-after')),
  );
}

function retryAfterOf(header: string | null): number | null {
  if (header === null || header.trim() === '') return null;
  const seconds = Number(header);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

export class OpenRouterClient {
  constructor(private readonly options: OpenRouterClientOptions) {}

  retrying<T>(run: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
    const signals = [signal, this.options.shutdown].filter((entry) => entry !== undefined);
    return retryTransient(run, { signal: AbortSignal.any(signals) });
  }

  usingFetch(scope: (fetcher: typeof fetch) => typeof fetch): OpenRouterClient {
    return new OpenRouterClient({ ...this.options, fetch: scope(this.options.fetch) });
  }

  async *chat(req: ChatRequest, signal: AbortSignal): AsyncGenerator<OrChunk> {
    const response = await this.send({
      path: '/chat/completions',
      method: 'POST',
      body: requestBody(req),
      signal,
    });
    if (response.body === null) {
      throw openRouterError('unreadable', 'empty stream');
    }
    let finished = false;
    for await (const data of sseData(response.body, signal)) {
      const chunk = parseChunk(data);
      finished ||= chunk.usage !== undefined && chunk.usage !== null;
      yield chunk;
    }
    if (!finished && !signal.aborted) {
      throw openRouterError('unavailable', 'the answer stopped before it finished');
    }
  }

  async models(): Promise<OrModel[]> {
    return (await this.json({ path: '/models', key: null }, OR_MODELS, 'model list')).data;
  }

  async transcriptionModels(): Promise<OrModel[]> {
    return (
      await this.json(
        { path: '/models?output_modalities=transcription', key: null },
        OR_MODELS,
        'transcription model list',
      )
    ).data;
  }

  async videoModels(): Promise<OrVideoModel[]> {
    return (await this.json({ path: '/videos/models', key: null }, OR_VIDEO_MODELS, 'video list'))
      .data;
  }

  async imageModels(signal?: AbortSignal): Promise<OrImageModel[]> {
    const call: OpenRouterCall = { path: '/images/models', key: null };
    return (
      await this.json(
        signal === undefined ? call : { ...call, signal },
        OR_IMAGE_MODELS,
        'image list',
      )
    ).data;
  }

  async imageEndpoints(model: OrImageModel, signal: AbortSignal): Promise<ImageEndpointWire[]> {
    const path = model.endpoints.replace(/^\/api\/v1/, '');
    const answer = await this.json(
      { path, key: null, signal },
      IMAGE_ENDPOINTS_WIRE,
      `${model.id} image endpoints`,
    );
    return answer.endpoints;
  }

  image<T>(body: unknown, schema: z.ZodType<T>, signal: AbortSignal): Promise<T> {
    return this.json(
      { path: '/images', method: 'POST', body, signal, responseBytesMax: IMAGE_RESPONSE_BYTES_MAX },
      schema,
      'image response',
    );
  }

  async *imageEvents(body: unknown, signal: AbortSignal): AsyncGenerator<string> {
    const response = await this.send({
      path: '/images',
      method: 'POST',
      body,
      signal,
      responseBytesMax: IMAGE_RESPONSE_BYTES_MAX,
    });
    if (response.body === null) {
      throw openRouterError('unreadable', 'empty stream');
    }
    yield* sseData(response.body, signal, IMAGE_STREAM_IDLE_MS);
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
    const json = readJson(await responseText(response, call.responseBytesMax));
    if (!json.ok) {
      throw openRouterError('unreadable', `${what} wasn’t JSON: ${json.reason}`);
    }
    const refused = OR_ERROR.safeParse(json.value);
    if (refused.success) {
      const { code, message } = refused.data.error;
      const status = typeof code === 'number' ? code : null;
      throw openRouterError(
        status === null ? 'unavailable' : errorCodeOf(status),
        message.slice(0, 200),
        status,
      );
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
      throw openRouterError('unavailable', `couldn’t reach OpenRouter: ${networkFailure(cause)}`);
    }
    if (!response.ok) {
      throw await failureOf(response, call.responseBytesMax);
    }
    return response;
  }
}
