import type { JsonValue, WebSource } from '@smarteverything/domain';
import type { ToolCall } from './chat-types';
import { openRouterError } from './errors';
import type { OrChunk, OrUsage } from './wire';

type Delta = NonNullable<OrChunk['choices'][number]['delta']>;

interface PendingCall {
  id: string | null;
  name: string | null;
  arguments: string;
}

export interface Turn {
  readonly generationId: string;
  readonly model: string;
  readonly text: string;
  readonly reasoning: string;
  readonly reasoningDetails: readonly JsonValue[];
  readonly toolCalls: readonly ToolCall[];
  readonly citations: readonly WebSource[];
  readonly finishReason: string | null;
  readonly usage: OrUsage | null;
}

function finished(index: number, call: PendingCall): ToolCall {
  if (call.id === null || call.name === null) {
    throw openRouterError('unreadable', `tool call ${String(index)} came without an id or name`);
  }
  return {
    id: call.id,
    type: 'function',
    function: { name: call.name, arguments: call.arguments },
  };
}

export class TurnAccumulator {
  private generationId: string | null = null;
  private model: string | null = null;
  private text = '';
  private reasoning = '';
  private readonly reasoningDetails: JsonValue[] = [];
  private readonly calls = new Map<number, PendingCall>();
  private readonly citations: WebSource[] = [];
  private finishReason: string | null = null;
  private usage: OrUsage | null = null;

  feed(chunk: OrChunk): void {
    this.generationId ??= chunk.id;
    this.model ??= chunk.model;
    for (const choice of chunk.choices) {
      if (choice.delta !== undefined) this.delta(choice.delta);
      if (typeof choice.finish_reason === 'string') this.finishReason = choice.finish_reason;
    }
    if (chunk.usage !== undefined && chunk.usage !== null) this.usage = chunk.usage;
  }

  result(): Turn {
    if (this.generationId === null || this.model === null) {
      throw openRouterError('unreadable', 'the answer had no generation id');
    }
    return {
      generationId: this.generationId,
      model: this.model,
      text: this.text,
      reasoning: this.reasoning,
      reasoningDetails: [...this.reasoningDetails],
      toolCalls: [...this.calls.entries()]
        .sort(([a], [b]) => a - b)
        .map(([index, call]) => finished(index, call)),
      citations: [...this.citations],
      finishReason: this.finishReason,
      usage: this.usage,
    };
  }

  private delta(delta: Delta): void {
    this.text += delta.content ?? '';
    this.reasoning += delta.reasoning ?? '';
    this.reasoningDetails.push(...(delta.reasoning_details ?? []));
    this.cite(delta.annotations ?? []);
    this.callDeltas(delta.tool_calls ?? []);
  }

  private cite(annotations: NonNullable<Delta['annotations']>): void {
    for (const { type, url_citation: source } of annotations) {
      if (type === 'url_citation' && source !== undefined) {
        this.citations.push({ url: source.url, title: source.title ?? '' });
      }
    }
  }

  private callDeltas(deltas: NonNullable<Delta['tool_calls']>): void {
    for (const { index, id, function: fn } of deltas) {
      const call = this.calls.get(index) ?? { id: null, name: null, arguments: '' };
      call.id ??= id ?? null;
      call.name ??= fn?.name ?? null;
      call.arguments += fn?.arguments ?? '';
      this.calls.set(index, call);
    }
  }
}
