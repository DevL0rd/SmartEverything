import { describe, expect, it } from 'vitest';
import { OpenRouterClient } from '../../src/openrouter/client';
import type { ChatRequest } from '../../src/openrouter/chat-types';
import { TurnAccumulator, type Turn } from '../../src/openrouter/turn';

const BASE = { id: 'gen-9', model: 'openai/gpt-x' };

const RICH = [
  { ...BASE, choices: [{ delta: { role: 'assistant', content: '' } }] },
  { ...BASE, choices: [{ delta: { reasoning: 'Think ' } }] },
  {
    ...BASE,
    choices: [
      {
        delta: {
          reasoning: 'more',
          reasoning_details: [{ type: 'reasoning.text', text: 'Think more', index: 0 }],
        },
      },
    ],
  },
  { ...BASE, choices: [{ delta: { content: 'Hel' } }] },
  {
    ...BASE,
    choices: [
      {
        delta: {
          content: 'lo',
          tool_calls: [{ index: 1, id: 'call_b', function: { name: 'second', arguments: '{"b"' } }],
        },
      },
    ],
  },
  {
    ...BASE,
    choices: [
      {
        delta: {
          tool_calls: [{ index: 0, id: 'call_a', function: { name: 'first', arguments: '{"a":' } }],
        },
      },
    ],
  },
  {
    ...BASE,
    choices: [
      {
        delta: {
          tool_calls: [
            { index: 0, function: { arguments: '1}' } },
            { index: 1, function: { arguments: ':2}' } },
          ],
        },
      },
    ],
  },
  { ...BASE, choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
  {
    ...BASE,
    choices: [],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 5,
      cost: 0.002,
      prompt_tokens_details: { cached_tokens: 3 },
      completion_tokens_details: { reasoning_tokens: 2 },
      server_tool_use: { web_search_requests: 2 },
    },
  },
];

const REQUEST: ChatRequest = {
  model: 'openai/gpt-x',
  messages: [{ role: 'user', content: 'Hi' }],
  effort: null,
};

function clientFor(frames: readonly string[]): OpenRouterClient {
  return new OpenRouterClient({
    key: (): string => 'test-key',
    fetch: (): Promise<Response> => Promise.resolve(new Response(frames.join(''), { status: 200 })),
  });
}

function framed(chunks: readonly unknown[]): string[] {
  return [...chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`), 'data: [DONE]\n\n'];
}

async function turnOf(client: OpenRouterClient): Promise<Turn> {
  const turn = new TurnAccumulator();
  for await (const chunk of client.chat(REQUEST, new AbortController().signal)) turn.feed(chunk);
  return turn.result();
}

describe('an OpenRouter chat stream folded into a turn', () => {
  it('merges text, reasoning, tool calls split across deltas, and usage', async () => {
    const turn = await turnOf(clientFor(framed(RICH)));
    expect(turn).toMatchObject({
      generationId: 'gen-9',
      model: 'openai/gpt-x',
      text: 'Hello',
      reasoning: 'Think more',
      reasoningDetails: [{ type: 'reasoning.text', text: 'Think more', index: 0 }],
      toolCalls: [
        { id: 'call_a', type: 'function', function: { name: 'first', arguments: '{"a":1}' } },
        { id: 'call_b', type: 'function', function: { name: 'second', arguments: '{"b":2}' } },
      ],
      citations: [],
      finishReason: 'tool_calls',
      usage: { cost: 0.002, prompt_tokens: 10, completion_tokens: 5 },
    });
  });

  it('turns a mid-stream error frame into a classified error', async () => {
    const frames = framed([
      { ...BASE, choices: [{ delta: { content: 'x' } }] },
      {
        ...BASE,
        error: { code: 429, message: 'slow down' },
        choices: [{ delta: { content: '' }, finish_reason: 'error' }],
      },
    ]);
    await expect(turnOf(clientFor(frames))).rejects.toMatchObject({ code: 'rate_limited' });
    await expect(turnOf(clientFor(frames))).rejects.toThrow('slow down');
  });

  it('treats a non-numeric error code as an unavailable provider', async () => {
    const frames = framed([
      { ...BASE, error: { code: 'server_error', message: 'Provider disconnected' }, choices: [] },
    ]);
    await expect(turnOf(clientFor(frames))).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('rejects a tool call that never named itself', async () => {
    const frames = framed([
      {
        ...BASE,
        choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{}' } }] } }],
      },
      { ...BASE, choices: [], usage: { prompt_tokens: 1, completion_tokens: 1 } },
    ]);
    await expect(turnOf(clientFor(frames))).rejects.toMatchObject({ code: 'unreadable' });
  });

  it('rejects a stream that ends before the usage chunk', async () => {
    const frames = framed([{ ...BASE, choices: [{ delta: { content: 'x' } }] }]);
    await expect(turnOf(clientFor(frames))).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('rejects a frame that is not JSON', async () => {
    await expect(turnOf(clientFor(['data: nope\n\n']))).rejects.toMatchObject({
      code: 'unreadable',
    });
  });

  it('refuses a result before any chunk arrived', () => {
    expect(() => new TurnAccumulator().result()).toThrow('no generation id');
  });
});
