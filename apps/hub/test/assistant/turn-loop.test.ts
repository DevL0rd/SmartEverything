import { afterEach, describe, expect, it } from 'vitest';
import { runLoop, type TurnUsage } from '../../src/assistant/engines/openrouter/turn-loop';
import { TurnStream } from '../../src/assistant/engines/openrouter/stream';
import type { ChatChunk } from '../../src/openrouter/chat-types';
import { TurnAccumulator } from '../../src/openrouter/turn';

let stream: TurnStream | null = null;

afterEach(() => {
  stream?.close();
  stream = null;
});

async function* dropped(): AsyncIterable<ChatChunk> {
  await Promise.resolve();
  yield {
    type: 'start',
    generationId: 'gen-7',
    model: 'google/gemini-3.5-flash',
  };
  yield { type: 'text', text: 'Half an' };
  throw new Error('The connection dropped.');
}

describe('the OpenRouter turn loop', () => {
  it('records a step that broke off mid-stream as an estimated cost', async () => {
    const usage: TurnUsage[] = [];
    stream = new TurnStream(
      { chatId: 'chat', turnId: 'turn', messageId: null, profileId: 'profile' },
      () => undefined,
    );
    const run = runLoop({
      client: { chat: (): AsyncIterable<ChatChunk> => dropped() },
      newTurn: () => new TurnAccumulator(),
      model: {
        choice: 'google/gemini-3.5-flash',
        model_id: 'google/gemini-3.5-flash',
        name: 'Flash',
        effort: null,
      },
      messages: [{ role: 'user', content: 'Hi' }],
      tools: [],
      hub: null,
      caller: {
        profileId: 'profile',
        role: 'owner',
        chatId: 'chat',
        via: 'chat',
        clientId: null,
      },
      images: { model: 'google/gemini-3.5-flash', allowed: false },
      work: 'chat',
      webSearch: false,
      signal: new AbortController().signal,
      hooks: {
        stream,
        text: (): void => undefined,
        toolLine: (): void => undefined,
        toolFailed: (): void => undefined,
        usage: (entry): void => {
          usage.push(entry);
        },
        retried: (): void => undefined,
      },
    });
    await expect(run).rejects.toThrow('The connection dropped.');
    expect(usage).toEqual([
      {
        source: 'openrouter',
        work: 'chat',
        model_id: 'google/gemini-3.5-flash',
        generation_id: 'gen-7',
        cost_micros: 0,
        cost_state: 'estimated',
      },
    ]);
  });
});
