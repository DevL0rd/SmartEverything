import { randomUUID } from 'node:crypto';
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages';
import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { ProviderContent, ProviderTurn } from '@smarteverything/domain';

const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export class ProviderInputError extends Error {
  override readonly name: string = 'ProviderInputError';
}

export class ProviderInput implements AsyncIterable<SDKUserMessage> {
  private readonly queued: SDKUserMessage[] = [];
  private waiting: ((value: IteratorResult<SDKUserMessage>) => void) | null = null;
  private closed = false;

  push(message: SDKUserMessage): void {
    if (this.closed) {
      throw new ProviderInputError('The provider input has closed.');
    }
    const waiting = this.waiting;
    this.waiting = null;
    if (waiting === null) {
      this.queued.push(message);
    } else {
      waiting({ done: false, value: message });
    }
  }

  close(): void {
    this.closed = true;
    this.queued.length = 0;
    this.waiting?.({ done: true, value: undefined });
    this.waiting = null;
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return { next: () => this.next() };
  }

  private next(): Promise<IteratorResult<SDKUserMessage>> {
    const value = this.queued.shift();
    if (value !== undefined) {
      return Promise.resolve({ done: false, value });
    }
    if (this.closed) {
      return Promise.resolve({ done: true, value: undefined });
    }
    return new Promise((resolve) => {
      this.waiting = resolve;
    });
  }
}

function contentOf(content: readonly ProviderContent[]): ContentBlockParam[] {
  return content.map((part) => {
    if (part.type === 'text') {
      return { type: 'text', text: part.text };
    }
    if (!BASE64.test(part.data) || Buffer.from(part.data, 'base64').length === 0) {
      throw new ProviderInputError('Image or document content must be nonempty canonical base64.');
    }
    if (part.type === 'image') {
      return {
        type: 'image',
        source: { type: 'base64', media_type: part.media_type, data: part.data },
      };
    }
    return {
      type: 'document',
      source: { type: 'base64', media_type: part.media_type, data: part.data },
    };
  });
}

export function userMessageOf(turn: ProviderTurn): SDKUserMessage {
  const message = turn.messages.at(-1);
  if (message?.role !== 'user') {
    throw new ProviderInputError('A provider turn must finish with a user message.');
  }
  if (
    turn.session_id === null &&
    turn.messages.length > 1 &&
    message.content.some((part) => part.type === 'text' && part.text.trimStart().startsWith('/'))
  )
    throw new ProviderInputError(
      'Start or resume a session before using a Claude slash command with conversation history.',
    );
  return {
    type: 'user',
    uuid: messageUuid(turn.job_id),
    parent_tool_use_id: null,
    message: {
      role: 'user',
      content:
        turn.session_id === null && turn.messages.length > 1
          ? turn.messages.flatMap((entry, index) => [
              {
                type: 'text' as const,
                text:
                  index === turn.messages.length - 1
                    ? 'Current user message:'
                    : `Earlier ${entry.role} conversation context:`,
              },
              ...contentOf(entry.content),
            ])
          : contentOf(message.content),
    },
  };
}

export function steerMessageOf(content: readonly ProviderContent[]): SDKUserMessage {
  return {
    type: 'user',
    uuid: randomUUID(),
    parent_tool_use_id: null,
    priority: 'next',
    message: { role: 'user', content: contentOf(content) },
  };
}

function messageUuid(id: string): NonNullable<SDKUserMessage['uuid']> {
  const [a, b, c, d, e] = id.split('-');
  if (a === undefined || b === undefined || c === undefined || d === undefined || e === undefined)
    throw new ProviderInputError('The provider message requires a UUID.');
  return `${a}-${b}-${c}-${d}-${e}`;
}
