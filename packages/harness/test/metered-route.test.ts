import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ReasoningEffortId, createUserMessage } from '@deepseek-ai/dsh-llm';
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
import type { Context } from '@deepseek-ai/cordis';
import { ApiError } from '@smarteverything/domain';
import type { AiModelRoute } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { LogRecord } from '@smarteverything/logging';
import { MeteredRouteAdapter } from '../src/process/model-route';
import type { MeteredRouteTransport } from '../src/process/model-route';
import { bootRuntime } from './support/runtime';
import { ask, bootAdapterLoop, turnEnds } from './support/loop-testkit';
import { METERED_REFUSED_CODE } from '../src/process/metered-refusal';

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

class RefusingTransport extends Transport {
  constructor(private readonly refusal: ApiError) {
    super('');
  }
  override fetch(): typeof fetch {
    return (): Promise<Response> => {
      this.requests += 1;
      return Promise.reject(this.refusal);
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

  it.each(['max', 'high', 'low', 'none'])(
    'accepts the %s effort the hub offers for a DeepSeek model',
    async (effort) => {
      const id = '~deepseek/deepseek-flash-latest';
      const reasoning = model(id, { context: 200_000 });
      const transport = new Transport(streamBody(['ok']));
      const adapter = new MeteredRouteAdapter(
        route([
          {
            ...reasoning,
            capabilities: {
              ...reasoning.capabilities,
              reasoning: true,
              efforts: ['max', 'high', 'low', 'none'],
            },
          },
        ]),
        transport,
        {},
      );
      let llm: Context['llm'] | undefined;
      const host = await bootRuntime({
        mount: (active) => {
          llm = active.llm;
          active.effect(() => active.llm.registerAdapter([ROUTE_ID], adapter));
        },
      });
      try {
        if (llm === undefined) throw new Error('The test runtime did not mount the model host.');
        const chunks = await collect(
          llm.stream({ ...request(id), reasoningEffort: ReasoningEffortId(effort) }),
        );

        expect(chunks.some((chunk) => chunk.type === 'text-delta')).toBe(true);
        expect(
          chunks.some((chunk) => chunk.type === 'finish' && chunk.reason.kind === 'error'),
        ).toBe(false);
        expect(transport.requests).toBe(1);
      } finally {
        await host.dispose();
      }
    },
  );

  it('lets DSH apply the catalogue default only when no effort was chosen', async () => {
    const id = '~deepseek/deepseek-flash-latest';
    const base = model(id, { context: 200_000 });
    const adapter = new MeteredRouteAdapter(
      route([
        {
          ...base,
          capabilities: {
            ...base.capabilities,
            reasoning: true,
            efforts: ['low', 'high'],
            default_effort: 'high',
          },
        },
      ]),
      new Transport(streamBody(['ok'])),
      {},
    );
    let llm: Context['llm'] | undefined;
    const host = await bootRuntime({
      mount: (active) => {
        llm = active.llm;
        active.effect(() => active.llm.registerAdapter([ROUTE_ID], adapter));
      },
    });
    try {
      if (llm === undefined) throw new Error('The test runtime did not mount the model host.');
      const call = { provider: ROUTE_ID, model: id };
      expect((await llm.prepareCall(call)).config.reasoningEffort).toBe('high');
      expect(
        (await llm.prepareCall({ ...call, reasoningEffort: ReasoningEffortId('low') })).config
          .reasoningEffort,
      ).toBe('low');
    } finally {
      await host.dispose();
    }
  });
});

describe('a refusal by our own metered fetch', () => {
  afterEach(() => {
    Logger.reset();
  });

  it('is logged once, ends the turn as a visible failure and is never retried', async () => {
    const id = 'anthropic/claude-sonnet-4';
    const records: LogRecord[] = [];
    Logger.configure({ level: 'warn', sink: (record) => records.push(record) });
    const message = 'Metered event belongs to another initiating profile or conversation.';
    const transport = new RefusingTransport(new ApiError('forbidden', message));
    const loop = await bootAdapterLoop({
      provider: ROUTE_ID,
      model: id,
      adapter: new MeteredRouteAdapter(
        route([model(id, { context: 200_000, output: 8_000 })]),
        transport,
        {},
      ),
    });
    try {
      const agent = await loop.agent('refused');

      await ask(agent, 'hello');

      expect(turnEnds(loop.events(agent.session.id))).toStrictEqual([
        { kind: 'error', code: METERED_REFUSED_CODE, message },
      ]);
      expect(transport.requests).toBe(1);
      const refused = records.filter((record) => record.event === 'metered.refused');
      expect(refused).toHaveLength(1);
      expect(refused[0]).toMatchObject({
        level: 'warn',
        scope: 'hub.harness',
        payload: { route_id: ROUTE_ID, model: id, refusal: 'forbidden', reason: message },
      });
    } finally {
      await loop.dispose();
    }
  });

  it('ends a stream whose supplying key is refused with the same failure', async () => {
    const id = 'anthropic/claude-sonnet-4';
    const records: LogRecord[] = [];
    Logger.configure({ level: 'warn', sink: (record) => records.push(record) });
    class NoKey extends Transport {
      override key(): Promise<string> {
        throw new ApiError('conflict', 'The selected supplying account is unavailable.');
      }
    }
    const transport = new NoKey(streamBody(['ok']));
    const adapter = new MeteredRouteAdapter(
      route([model(id, { context: 200_000, output: 8_000 })]),
      transport,
      {},
    );

    const failure = await collect(adapter.stream(request(id))).then(
      () => undefined,
      (cause: unknown) => cause,
    );

    expect(failure).toMatchObject({
      code: METERED_REFUSED_CODE,
      message: 'The selected supplying account is unavailable.',
    });
    expect(transport.requests).toBe(0);
    expect(records.filter((record) => record.event === 'metered.refused')).toHaveLength(1);
  });
});
