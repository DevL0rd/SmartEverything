import {
  MICROS_PER_USD,
  type AiResolvedModel,
  type UsageEntry,
  type UsageWork,
} from '@smarteverything/domain';
import type { ToolCaller } from '../../../ai-tools/hub-tool';
import type { ToolHub } from '../../../ai-tools/tool-hub';
import type { ChatChunk, ChatMessage, ChatTool } from '../../../openrouter/chat-types';
import type { ChatClientPort, TurnPort, TurnResult } from './ports';
import type { TurnStream } from './stream';
import { explicitCache } from './context';
import { runTools, type PictureReader } from './tools';

export const MAX_STEPS = 24;

export type TurnUsage = Omit<UsageEntry, 'profile_id'>;

export interface LoopHooks {
  readonly stream: TurnStream;
  readonly text: () => void;
  readonly toolLine: (line: string) => void;
  readonly usage: (entry: TurnUsage) => void;
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
  readonly signal: AbortSignal;
  readonly hooks: LoopHooks;
}

export interface LoopResult {
  readonly text: string;
  readonly model: string;
  readonly finish: string | null;
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
    ...costOf(result),
  };
}

class Loop {
  private readonly messages: ChatMessage[];

  constructor(private readonly input: LoopInput) {
    this.messages = [...input.messages];
  }

  async run(): Promise<LoopResult> {
    for (let step = 0; step < MAX_STEPS; step += 1) {
      const result = await this.complete(step === MAX_STEPS - 1);
      this.input.hooks.usage(usageOf(result, this.input.model.model_id, this.input.work));
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
    return { text, model: result.model ?? this.input.model.model_id, finish: result.finishReason };
  }

  private async complete(last: boolean): Promise<TurnResult> {
    const turn = this.input.newTurn();
    const { stream } = this.input.hooks;
    stream.newStep();
    const request = {
      model: this.input.model.model_id,
      messages: this.messages,
      effort: this.input.model.effort,
      cacheControl: explicitCache(this.input.model.model_id),
      ...(this.input.tools.length === 0 || last
        ? {}
        : { tools: this.input.tools, parallelToolCalls: true }),
    };
    let generationId: string | null = null;
    try {
      for await (const chunk of this.input.client.chat(request, this.input.signal)) {
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
      throw cause;
    }
    return turn.result();
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
      hub,
      caller: this.input.caller,
      images: this.input.images,
      tool: (item) => {
        this.input.hooks.stream.tool(item);
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
