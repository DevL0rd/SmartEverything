import type { JsonValue } from '@smarteverything/domain';
import type { ChatChunk, ChatUsage, ToolCall } from './chat-types';
import { openRouterError } from './errors';

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
  readonly finishReason: string | null;
  readonly usage: ChatUsage | null;
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
  private finishReason: string | null = null;
  private usage: ChatUsage | null = null;

  feed(chunk: ChatChunk): void {
    switch (chunk.type) {
      case 'start':
        this.generationId = chunk.generationId;
        this.model = chunk.model;
        return;
      case 'text':
        this.text += chunk.text;
        return;
      case 'reasoning':
        this.reasoning += chunk.text;
        return;
      case 'reasoning_details':
        this.reasoningDetails.push(...chunk.details);
        return;
      case 'tool_call':
        this.toolDelta(chunk);
        return;
      case 'finish':
        this.finishReason = chunk.reason;
        return;
      case 'usage':
        this.usage = chunk.usage;
        return;
    }
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
      finishReason: this.finishReason,
      usage: this.usage,
    };
  }

  private toolDelta(chunk: Extract<ChatChunk, { type: 'tool_call' }>): void {
    const call = this.calls.get(chunk.index) ?? { id: null, name: null, arguments: '' };
    call.id ??= chunk.id;
    call.name ??= chunk.name;
    call.arguments += chunk.arguments;
    this.calls.set(chunk.index, call);
  }
}
