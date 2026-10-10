import {
  MICROS_PER_USD,
  WEB_SOURCE,
  type AiResolvedModel,
  type UsageEntry,
  type UsageWork,
  type WebSource,
} from '@smarteverything/domain';
import { setTimeout as pause } from 'node:timers/promises';
import type { ToolCaller } from '../../../ai-tools/hub-tool';
import type { ToolHub } from '../../../ai-tools/tool-hub';
import type { ChatChunk, ChatMessage, ChatRequest, ChatTool } from '../../../openrouter/chat-types';
import { OpenRouterError } from '../../../openrouter/errors';
import type { ChatClientPort, TurnPort, TurnResult } from './ports';
import type { TurnStream } from './stream';
import { cacheSession, explicitCache, prefixBreakpoint } from './cache';
import { mergedSources, WEB_SEARCH_FAILED_TITLE, WEB_SEARCH_STEP_TITLE } from '../../web-search';
import { runTools, type PictureReader } from './tools';

export const MAX_STEPS = 24;
export const RETRY_PAUSE_MS = 800;
const SOURCE_TITLE_MAX = 300;

export type TurnUsage = Omit<UsageEntry, 'profile_id'>;

export interface LoopHooks {
  readonly stream: TurnStream;
  readonly text: () => void;
  readonly toolLine: (line: string) => void;
  readonly toolFailed: (name: string, reason: string) => void;
  readonly usage: (entry: TurnUsage) => void;
  readonly retried: (reason: string) => void;
}

export interface LoopInput {
  readonly client: ChatClientPort;
  readonly newTurn: () => TurnPort;
  readonly model: AiResolvedModel;
  readonly messages: readonly ChatMessage[];
  readonly tools: readonly ChatTool[];
  readonly hub: ToolHub | null;
  readonly caller: ToolCaller;
  readonly images: PictureReader;
  readonly work: UsageWork;
  readonly webSearch: boolean;
  readonly signal: AbortSignal;
  readonly hooks: LoopHooks;
}

export interface LoopResult {
  readonly text: string;
  readonly model: string;
  readonly finish: string | null;
  readonly sources: readonly WebSource[];
}

export class NoAnswerError extends Error {
  override readonly name = 'NoAnswerError';
}

function costOf(result: TurnResult): Pick<UsageEntry, 'cost_micros' | 'cost_state'> {
  const cost = result.usage?.cost ?? null;
  return cost === null
    ? { cost_micros: 0, cost_state: 'estimated' }
    : { cost_micros: Math.max(0, Math.round(cost * MICROS_PER_USD)), cost_state: 'reported' };
}

export function pendingUsage(generationId: string, model: string, work: UsageWork): TurnUsage {
  return {
    source: 'openrouter',
    work,
    model_id: model,
    generation_id: generationId,
    cost_micros: 0,
    cost_state: 'estimated',
  };
}

function metaOf(usage: TurnResult['usage']): Pick<UsageEntry, 'meta'> | Record<string, never> {
  const meta = {
    ...(usage === null || usage.cacheWriteTokens === 0
      ? {}
      : { cache_write_tokens: usage.cacheWriteTokens }),
    ...(usage === null || usage.searchRequests === 0
      ? {}
      : { web_search_requests: usage.searchRequests }),
  };
  return Object.keys(meta).length === 0 ? {} : { meta };
}

function sourcesOf(result: TurnResult): readonly WebSource[] {
  return result.citations.flatMap((citation) => {
    const parsed = WEB_SOURCE.safeParse({
      url: citation.url,
      title: citation.title.slice(0, SOURCE_TITLE_MAX),
    });
    return parsed.success ? [parsed.data] : [];
  });
}

export function usageOf(result: TurnResult, model: string, work: UsageWork): TurnUsage {
  const usage = result.usage;
  return {
    source: 'openrouter',
    work,
    model_id: result.model ?? model,
    generation_id: result.generationId,
    tokens_in: usage?.promptTokens ?? 0,
    tokens_out: usage?.completionTokens ?? 0,
    tokens_cached: usage?.cachedTokens ?? 0,
    tokens_reasoning: usage?.reasoningTokens ?? 0,
    ...metaOf(usage),
    ...costOf(result),
  };
}

type Attempt =
  | { readonly kind: 'done'; readonly result: TurnResult }
  | { readonly kind: 'transient'; readonly cause: OpenRouterError };

function isTransient(cause: unknown): cause is OpenRouterError {
  return cause instanceof OpenRouterError && cause.retryable;
}

class Loop {
  private readonly messages: ChatMessage[];
  private readonly refused = new Map<string, string>();
  private sources: readonly WebSource[] = [];
  private searches = 0;

  constructor(private readonly input: LoopInput) {
    this.messages = [...input.messages];
  }

  async run(): Promise<LoopResult> {
    for (let step = 0; step < MAX_STEPS; step += 1) {
      const result = await this.complete(step === MAX_STEPS - 1);
      this.input.hooks.usage(usageOf(result, this.input.model.model_id, this.input.work));
      this.searched(result);
      if (result.toolCalls.length === 0 || this.input.hub === null) {
        return this.finish(result);
      }
      await this.tools(result);
    }
    throw new NoAnswerError(`The AI did not finish within ${String(MAX_STEPS)} steps.`);
  }

  private finish(result: TurnResult): LoopResult {
    const text = this.input.hooks.stream.spoken;
    if (text === '') {
      throw new NoAnswerError('The model sent no answer. Try again or pick another model.');
    }
    return {
      text,
      model: result.model ?? this.input.model.model_id,
      finish: result.finishReason,
      sources: this.sources,
    };
  }

  private searched(result: TurnResult): void {
    const found = sourcesOf(result);
    const requests = result.usage?.searchRequests ?? 0;
    if (requests === 0 && found.length === 0) {
      return;
    }
    this.sources = mergedSources(this.sources, found);
    this.searches += 1;
    this.input.hooks.stream.tool({
      callId: `web-search-${String(this.searches)}`,
      name: 'web_search',
      title: WEB_SEARCH_STEP_TITLE,
      state: 'done',
      detail: found.length === 0 ? null : `${String(found.length)} sources`,
    });
  }

  private searchFailed(cause: unknown): void {
    if (!this.input.webSearch || !(cause instanceof OpenRouterError) || cause.retryable) {
      return;
    }
    this.searches += 1;
    this.input.hooks.stream.tool({
      callId: `web-search-${String(this.searches)}`,
      name: 'web_search',
      title: WEB_SEARCH_FAILED_TITLE,
      state: 'failed',
      detail: cause.message.slice(0, 400),
    });
  }

  private async complete(last: boolean): Promise<TurnResult> {
    this.input.hooks.stream.newStep();
    const first = await this.attempt(last);
    if (first.kind === 'done') {
      return first.result;
    }
    this.input.hooks.retried(first.cause.message);
    await pause(RETRY_PAUSE_MS, undefined, { signal: this.input.signal });
    const second = await this.attempt(last);
    if (second.kind === 'done') {
      return second.result;
    }
    throw second.cause;
  }

  private request(last: boolean): ChatRequest {
    const { model, webSearch, tools } = this.input;
    return {
      model: model.model_id,
      messages: this.messages,
      effort: model.effort,
      cacheControl: explicitCache(model.model_id),
      prefixBreakpoint: prefixBreakpoint(model.model_id),
      sessionId: cacheSession(model.model_id),
      ...(webSearch ? { webSearch: true } : {}),
      ...(tools.length === 0 || last ? {} : { tools, parallelToolCalls: true }),
    };
  }

  private async attempt(last: boolean): Promise<Attempt> {
    const turn = this.input.newTurn();
    const { stream } = this.input.hooks;
    const request = this.request(last);
    let generationId: string | null = null;
    let received = false;
    try {
      for await (const chunk of this.input.client.chat(request, this.input.signal)) {
        received = true;
        generationId = chunk.type === 'start' ? chunk.generationId : generationId;
        turn.feed(chunk);
        this.show(chunk, stream);
      }
    } catch (cause) {
      if (generationId !== null) {
        this.input.hooks.usage(
          pendingUsage(generationId, this.input.model.model_id, this.input.work),
        );
      }
      if (!received && !this.input.signal.aborted && isTransient(cause)) {
        return { kind: 'transient', cause };
      }
      this.searchFailed(cause);
      throw cause;
    }
    return { kind: 'done', result: turn.result() };
  }

  private show(chunk: ChatChunk, stream: TurnStream): void {
    if (chunk.type === 'text') {
      stream.text(chunk.text);
      this.input.hooks.text();
    } else if (chunk.type === 'reasoning') {
      stream.reasoning(chunk.text);
    }
  }

  private async tools(result: TurnResult): Promise<void> {
    const hub = this.input.hub;
    if (hub === null) {
      return;
    }
    this.messages.push({
      role: 'assistant',
      content: result.text === '' ? null : result.text,
      tool_calls: result.toolCalls,
      ...(result.reasoningDetails.length === 0
        ? {}
        : { reasoning_details: result.reasoningDetails }),
    });
    const run = await runTools(result.toolCalls, {
      refused: this.refused,
      hub,
      caller: this.input.caller,
      images: this.input.images,
      tool: (item) => {
        this.input.hooks.stream.tool(item);
      },
      failed: (name, reason) => {
        this.input.hooks.toolFailed(name, reason);
      },
    });
    run.lines.forEach((line) => {
      this.input.hooks.toolLine(line);
    });
    this.messages.push(...run.messages);
  }
}

export function runLoop(input: LoopInput): Promise<LoopResult> {
  return new Loop(input).run();
}
