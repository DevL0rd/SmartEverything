import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
import type { AiModelRoute } from '@smarteverything/domain';
import { MeteredRouteAdapter } from '../src/process/model-route';
import type { MeteredRouteTransport } from '../src/process/model-route';

const ROUTE_ID = randomUUID();

function route(models: AiModelRoute['models']): AiModelRoute {
  return {
    id: ROUTE_ID,
    profile_id: randomUUID(),
    supplier: { kind: 'server' },
    subscriber_id: 'profile',
    auth: { provider: 'openrouter', kind: 'hub-api-key' },
    billing: 'metered',
    fallback: 'none',
    background_authorized: true,
    capability_revision: 'caps-1',
    state: 'ready',
    models,
  };
}

function model(
  id: string,
  limits: { context: number | null; output?: number | null },
): AiModelRoute['models'][number] {
  return {
    id,
    name: id,
    capabilities: {
      revision: 'caps-1',
      input_modalities: ['text'],
      output_modalities: ['text'],
      reasoning: false,
      efforts: [],
      local_tools: true,
      context_tokens: limits.context,
      ...(limits.output === undefined ? {} : { max_output_tokens: limits.output }),
      discovered_at: '2026-10-08T09:00:00.000Z',
    },
  };
}

function streamBody(words: readonly string[]): string {
  const frame = (delta: object, finish: string | null, usage?: object): string =>
    `data: ${JSON.stringify({
      id: 'gen-1',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'anthropic/claude-sonnet-4',
      choices: [{ index: 0, delta, finish_reason: finish }],
      ...(usage === undefined ? {} : { usage }),
    })}\n\n`;
  return [
    frame({ role: 'assistant', content: '' }, null),
    ...words.map((word) => frame({ content: word }, null)),
    frame({}, 'stop', { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }),
    'data: [DONE]\n\n',
  ].join('');
}

class Transport implements MeteredRouteTransport {
  authorizations = 0;
  requests = 0;
  constructor(private readonly body: string) {}
  key(): Promise<string> {
    return Promise.resolve('harness-managed-supplier');
  }
  authorize(): Promise<void> {
    this.authorizations += 1;
    return Promise.resolve();
  }
  fetch(): typeof fetch {
    return (): Promise<Response> => {
      this.requests += 1;
      return Promise.resolve(
        new Response(this.body, { headers: { 'content-type': 'text/event-stream' } }),
      );
    };
  }
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

function request(id: string): GenerateOptions {
  return {
    provider: ROUTE_ID,
    model: id,
    messages: [
      createUserMessage({ content: [{ type: 'text', text: 'hi' }], source: { kind: 'user' } }),
    ],
  };
}

describe('the metered OpenRouter route', () => {
  it('checks the writer once for a reply, however many chunks it streams', async () => {
    const id = 'anthropic/claude-sonnet-4';
    const transport = new Transport(streamBody(['one ', 'two ', 'three ', 'four ', 'five ']));
    const adapter = new MeteredRouteAdapter(
      route([model(id, { context: 200_000, output: 8_000 })]),
      transport,
      {},
    );

    const chunks = await collect(adapter.stream(request(id)));

    expect(chunks.filter((chunk) => chunk.type === 'text-delta').length).toBeGreaterThan(1);
    expect(transport.requests).toBe(1);
    expect(transport.authorizations).toBe(1);
  });

  it.each([
    ['anthropic/claude-sonnet-4', 'a Claude model'],
    ['openai/gpt-5', 'a GPT model'],
    ['vendor/open-model', 'a model from any other vendor'],
  ])('serves %s (%s) even when the catalogue gave no limits', async (id) => {
    const transport = new Transport(streamBody(['ok']));
    const adapter = new MeteredRouteAdapter(route([model(id, { context: null })]), transport, {});

    const resolved = await adapter.resolveModel(ROUTE_ID, id);
    const chunks = await collect(adapter.stream(request(id)));

    expect(resolved.context?.contextWindow).toBeGreaterThan(0);
    expect(chunks.some((chunk) => chunk.type === 'text-delta')).toBe(true);
  });
});
