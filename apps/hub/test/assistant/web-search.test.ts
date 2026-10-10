import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { chatSearchesWeb } from '@smarteverything/domain';
import { liveConfigOf, type LiveOptions } from '../../src/assistant-voice/gemini';
import { TurnStream } from '../../src/assistant/engines/openrouter/stream';
import { runLoop, type TurnUsage } from '../../src/assistant/engines/openrouter/turn-loop';
import { WEB_SEARCH_MAX_RESULTS } from '../../src/assistant/web-search';
import { OpenRouterClient } from '../../src/openrouter/client';
import type { ChatChunk, ChatRequest } from '../../src/openrouter/chat-types';
import { ChunkReader } from '../../src/openrouter/stream';
import { TurnAccumulator } from '../../src/openrouter/turn';

const FIXTURE = [
  {
    id: 'gen-1',
    model: 'google/gemini-3.5-flash',
    choices: [{ delta: { content: 'It is sunny' } }],
  },
  {
    id: 'gen-1',
    model: 'google/gemini-3.5-flash',
    choices: [
      {
        delta: {
          content: ' today.',
          annotations: [
            {
              type: 'url_citation',
              url_citation: { url: 'https://example.com/a', title: 'Weather A' },
            },
            {
              type: 'url_citation',
              url_citation: { url: 'https://example.com/a', title: 'Weather A' },
            },
            { type: 'url_citation', url_citation: { url: 'javascript:alert(1)', title: 'Bad' } },
            { type: 'file_citation' },
          ],
        },
      },
    ],
  },
  {
    id: 'gen-1',
    model: 'google/gemini-3.5-flash',
    choices: [{ delta: {}, finish_reason: 'stop' }],
    usage: {
      prompt_tokens: 4200,
      completion_tokens: 30,
      cost: 0.0113,
      server_tool_use: { web_search_requests: 1 },
    },
  },
];

function sse(): Response {
  const body = FIXTURE.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
    .concat('data: [DONE]\n\n')
    .join('');
  return new Response(body, { status: 200 });
}

const BODY = z.record(z.string(), z.unknown());

async function sentBody(request: ChatRequest): Promise<Record<string, unknown>> {
  const sent: string[] = [];
  const client = new OpenRouterClient({
    key: (): string => 'test-key',
    fetch: (_url, init): Promise<Response> => {
      sent.push(typeof init?.body === 'string' ? init.body : '');
      return Promise.resolve(sse());
    },
  });
  for await (const chunk of client.chat(request, new AbortController().signal)) {
    void chunk;
  }
  return BODY.parse(JSON.parse(sent[0] ?? ''));
}

const BASE: ChatRequest = {
  model: 'google/gemini-3.5-flash',
  messages: [{ role: 'user', content: 'Weather?' }],
  effort: null,
};

describe('web search in the OpenRouter request', () => {
  it.each([
    'google/gemini-3.5-flash',
    'openai/gpt-6-luna',
    'anthropic/claude-sonnet-5',
    'x-ai/grok-5',
  ])('adds the server tool for %s only when search is on', async (model) => {
    const off = await sentBody({ ...BASE, model });
    const on = await sentBody({ ...BASE, model, webSearch: true });
    expect(off).not.toHaveProperty('tools');
    expect(on.tools).toEqual([
      {
        type: 'openrouter:web_search',
        parameters: { engine: 'auto', max_results: WEB_SEARCH_MAX_RESULTS },
      },
    ]);
    expect(on.tool_choice).toBe('auto');
  });

  it('keeps the function tools beside the search tool', async () => {
    const tool = {
      type: 'function' as const,
      function: { name: 'get_weather', description: 'Weather', parameters: {} },
    };
    const body = await sentBody({ ...BASE, tools: [tool], webSearch: true });
    expect(body.tools).toHaveLength(2);
  });
});

describe('web search citations', () => {
  it('reads url citations and the search count from the stream', () => {
    const reader = new ChunkReader();
    const chunks = FIXTURE.flatMap((chunk) => reader.read(JSON.stringify(chunk)));
    const citations = chunks.filter((chunk) => chunk.type === 'citation');
    expect(citations).toHaveLength(3);
    const usage = chunks.find((chunk) => chunk.type === 'usage');
    expect(usage?.type === 'usage' ? usage.usage.searchRequests : null).toBe(1);
  });

  it('books the search in the ledger and keeps valid sources and a step', async () => {
    const usage: TurnUsage[] = [];
    const tools: string[] = [];
    const stream = new TurnStream(
      { chatId: 'chat', turnId: 'turn', messageId: null, profileId: 'profile' },
      () => undefined,
    );
    const reader = new ChunkReader();
    const chunks: ChatChunk[] = FIXTURE.flatMap((chunk) => reader.read(JSON.stringify(chunk)));
    const result = await runLoop({
      client: {
        chat: async function* (): AsyncGenerator<ChatChunk> {
          await Promise.resolve();
          yield* chunks;
        },
      },
      newTurn: () => new TurnAccumulator(),
      model: {
        choice: 'google/gemini-3.5-flash',
        model_id: 'google/gemini-3.5-flash',
        name: 'Flash',
        effort: null,
      },
      messages: [{ role: 'user', content: 'Weather?' }],
      tools: [],
      hub: null,
      caller: { profileId: 'profile', role: 'owner', chatId: 'chat', via: 'chat', clientId: null },
      images: { model: 'google/gemini-3.5-flash', allowed: false },
      work: 'chat',
      webSearch: true,
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
    tools.push(...stream.settled().map((step) => `${step.title}:${step.outcome}`));
    stream.close();
    expect(result.sources).toEqual([{ url: 'https://example.com/a', title: 'Weather A' }]);
    expect(tools).toEqual(['Searched the web:done']);
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({
      cost_micros: 11_300,
      cost_state: 'reported',
      meta: { web_search_requests: 1 },
    });
  });
});

describe('web search choice', () => {
  it('follows the default until the chat decides', () => {
    expect(chatSearchesWeb({ web_search: null }, true)).toBe(true);
    expect(chatSearchesWeb({ web_search: null }, false)).toBe(false);
    expect(chatSearchesWeb({ web_search: false }, true)).toBe(false);
    expect(chatSearchesWeb({ web_search: true }, false)).toBe(true);
  });

  it('adds googleSearch beside the function declarations on live calls only when on', () => {
    const options: LiveOptions = {
      model: 'gemini-3.8-live',
      voice: 'Puck',
      system: 's',
      tools: [],
      webSearch: true,
      resume: null,
      window: null,
      automatic: true,
    };
    expect(liveConfigOf(options).tools).toEqual([
      { googleSearch: {} },
      { functionDeclarations: [] },
    ]);
    expect(liveConfigOf({ ...options, webSearch: false }).tools).toEqual([
      { functionDeclarations: [] },
    ]);
  });
});
