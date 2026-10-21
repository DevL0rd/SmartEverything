import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { WEB_SOURCE } from '@smarteverything/domain';
import { WEB_SEARCH_MAX_RESULTS, mergedSources } from '../../src/assistant/web-search';
import { OpenRouterClient } from '../../src/openrouter/client';
import type { ChatRequest } from '../../src/openrouter/chat-types';
import { parseChunk } from '../../src/openrouter/stream';
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
    expect(on['tools']).toEqual([
      {
        type: 'openrouter:web_search',
        parameters: { engine: 'auto', max_results: WEB_SEARCH_MAX_RESULTS },
      },
    ]);
    expect(on['tool_choice']).toBe('auto');
  });

  it('keeps the function tools beside the search tool', async () => {
    const tool = {
      type: 'function' as const,
      function: { name: 'weather_read', description: 'Weather', parameters: {} },
    };
    const body = await sentBody({ ...BASE, tools: [tool], webSearch: true });
    expect(body['tools']).toHaveLength(2);
  });
});

function turnOf(): ReturnType<TurnAccumulator['result']> {
  const turn = new TurnAccumulator();
  FIXTURE.forEach((chunk) => {
    turn.feed(parseChunk(JSON.stringify(chunk)));
  });
  return turn.result();
}

describe('web search citations', () => {
  it('reads url citations and the search count from the stream', () => {
    const turn = turnOf();
    expect(turn.citations).toHaveLength(3);
    expect(turn.usage?.server_tool_use?.web_search_requests).toBe(1);
  });

  it('keeps the valid sources once each', () => {
    const valid = turnOf().citations.flatMap((source) => {
      const parsed = WEB_SOURCE.safeParse(source);
      return parsed.success ? [parsed.data] : [];
    });
    expect(valid).toHaveLength(2);
    expect(mergedSources([], valid)).toEqual([
      { url: 'https://example.com/a', title: 'Weather A' },
    ]);
  });
});
