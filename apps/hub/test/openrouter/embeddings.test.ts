import type { UsageEntry } from '@smarteverything/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { OpenRouterClient } from '../../src/openrouter/client';
import { bodyOf, urlOf, type SentBody } from './photos-transport';
import {
  EmbeddingBatchError,
  OpenRouterEmbeddings,
  PHOTOS_EMBEDDING_PROVIDER,
  truncateNormalised,
} from '../../src/openrouter/embeddings';

let sent: { url: string; body: SentBody }[] = [];
let metered: UsageEntry[] = [];

beforeEach(() => {
  sent = [];
  metered = [];
});

function clientOf(
  answer: (body: { input: readonly unknown[] }) => Response,
  key: string | null = 'key',
): OpenRouterClient {
  const transport: typeof fetch = async (input, init) => {
    const body = await bodyOf(init);
    sent.push({ url: urlOf(input), body });
    return answer({ input: body.input ?? [] });
  };
  return new OpenRouterClient({ fetch: transport, key: () => key });
}

function vectors(
  body: { input: readonly unknown[] },
  usage: unknown = { prompt_tokens: 30, cost: 0.000001 },
): Response {
  return Response.json({
    id: 'emb-1',
    data: body.input.map((_, index) => ({ index, embedding: [index + 1, 0] })).toReversed(),
    usage,
  });
}

function embeddings(client: OpenRouterClient): OpenRouterEmbeddings {
  return new OpenRouterEmbeddings(client, (entry) => {
    metered.push(entry);
    return Promise.resolve();
  });
}

describe('the shared embeddings client', () => {
  it('sends only the model and the input unless asked for more', async () => {
    const result = await embeddings(clientOf((body) => vectors(body))).embed({
      model: 'm',
      input: ['a', 'b'],
    });
    expect(sent[0]?.url).toBe('https://openrouter.ai/api/v1/embeddings');
    expect(sent[0]?.body).toStrictEqual({ model: 'm', input: ['a', 'b'] });
    expect(result.vectors.map((vector) => [...vector])).toStrictEqual([
      [1, 0],
      [2, 0],
    ]);
    expect(metered).toHaveLength(0);
  });

  it('sends multimodal content, dimensions and zero data retention routing', async () => {
    const input = [
      {
        content: [
          { type: 'text', text: 'a cat' } as const,
          { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AA==' } } as const,
        ],
      },
    ];
    await embeddings(clientOf((body) => vectors(body))).embed({
      model: 'google/gemini-embedding-2',
      input,
      dimensions: 512,
      provider: PHOTOS_EMBEDDING_PROVIDER,
    });
    expect(sent[0]?.body).toStrictEqual({
      model: 'google/gemini-embedding-2',
      input,
      dimensions: 512,
      provider: { zdr: true, data_collection: 'deny', allow_fallbacks: false },
    });
  });

  it('meters Photos analysis when it knows who to charge', async () => {
    await embeddings(clientOf((body) => vectors(body))).embed({
      model: 'qwen/qwen3-embedding-8b',
      input: ['x'],
      metering: { profileId: 'p1', kind: 'embedding', itemId: 'i1' },
    });
    expect(metered[0]).toMatchObject({
      work: 'photos',
      profile_id: 'p1',
      model_id: 'qwen/qwen3-embedding-8b',
      generation_id: 'emb-1',
      tokens_in: 30,
      tokens_out: 0,
      cost_micros: 1,
      meta: { kind: 'embedding', item_id: 'i1' },
    });
  });

  it('meters pet crops separately and tolerates a missing usage block', async () => {
    await embeddings(clientOf((body) => vectors(body, null))).embed({
      model: 'm',
      input: ['x'],
      metering: { profileId: 'p1', kind: 'pet_embedding', itemId: null },
    });
    expect(metered[0]).toMatchObject({
      cost_state: 'estimated',
      meta: { kind: 'pet_embedding', item_id: null },
    });
  });

  it('does not meter without a meter', async () => {
    const client = new OpenRouterEmbeddings(clientOf((body) => vectors(body)));
    await client.embed({
      model: 'm',
      input: ['x'],
      metering: { profileId: 'p', kind: 'embedding', itemId: null },
    });
    expect(metered).toHaveLength(0);
  });

  it.each([{ indexes: [0] }, { indexes: [0, 0] }, { indexes: [0, 2] }])(
    'refuses mismatched indexes $indexes',
    async ({ indexes }) => {
      const client = clientOf(() =>
        Response.json({ data: indexes.map((index) => ({ index, embedding: [1] })) }),
      );
      await expect(embeddings(client).embed({ model: 'm', input: ['a', 'b'] })).rejects.toThrow(
        EmbeddingBatchError,
      );
    },
  );

  it('batches many inputs into several requests and keeps their order', async () => {
    const texts = Array.from({ length: 7 }, (_, index) => `t${String(index)}`);
    const result = await embeddings(
      clientOf((body) =>
        Response.json({
          data: body.input.map((text, index) => ({
            index,
            embedding: [Number(typeof text === 'string' ? text.slice(1) : -1)],
          })),
        }),
      ),
    ).embedBatched({ model: 'm', input: texts }, 3);
    expect(sent.map((call) => call.body.input)).toStrictEqual([
      ['t0', 't1', 't2'],
      ['t3', 't4', 't5'],
      ['t6'],
    ]);
    expect(result.map((vector) => vector[0])).toStrictEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('batches by the default size and returns nothing for no input', async () => {
    const input = Array.from({ length: 129 }, () => 'x');
    expect(
      (await embeddings(clientOf((body) => vectors(body))).embedBatched({ model: 'm', input }))
        .length,
    ).toBe(129);
    expect(sent.map((call) => call.body.input?.length)).toStrictEqual([128, 1]);
    sent = [];
    expect(
      await embeddings(clientOf((body) => vectors(body))).embedBatched({ model: 'm', input: [] }),
    ).toStrictEqual([]);
    expect(sent).toHaveLength(0);
  });

  it('stops when its signal aborts', async () => {
    await expect(
      embeddings(clientOf((body) => vectors(body))).embed({
        model: 'm',
        input: ['x'],
        signal: AbortSignal.abort(new Error('stop')),
      }),
    ).rejects.toThrow('stop');
  });

  it('refuses without a key', async () => {
    await expect(
      embeddings(clientOf((body) => vectors(body), null)).embed({ model: 'm', input: ['x'] }),
    ).rejects.toMatchObject({
      code: 'no_key',
    });
  });
});

describe('truncating a vector', () => {
  it('keeps the leading values and scales them to unit length', () => {
    const cut = truncateNormalised(Float32Array.of(3, 4, 100, 100), 2);
    expect([...cut].map((value) => Number(value.toFixed(6)))).toStrictEqual([0.6, 0.8]);
  });

  it('leaves a zero vector alone', () => {
    expect([...truncateNormalised(Float32Array.of(0, 0, 1), 2)]).toStrictEqual([0, 0]);
  });
});
