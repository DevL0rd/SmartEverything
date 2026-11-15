import { z } from 'zod';
import type { OpenRouterClient } from './client';
import { PHOTOS_PROVIDER, photosUsageEntry, type PhotosMeter } from './photos-usage';
import type { OrUsage } from './wire';

export const EMBEDDING_BATCH_SIZE = 128;

export type EmbeddingContentPart =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'image_url'; readonly image_url: { readonly url: string } };

export type EmbeddingInput = string | { readonly content: readonly EmbeddingContentPart[] };

export interface EmbeddingProvider {
  readonly zdr: boolean;
  readonly data_collection: 'allow' | 'deny';
  readonly allow_fallbacks: boolean;
}

export interface EmbeddingMetering {
  readonly profileId: string;
  readonly kind: 'embedding' | 'pet_embedding';
  readonly itemId: string | null;
}

export interface EmbeddingRequest {
  readonly model: string;
  readonly input: readonly EmbeddingInput[];
  readonly dimensions?: number;
  readonly provider?: EmbeddingProvider;
  readonly metering?: EmbeddingMetering;
  readonly signal?: AbortSignal;
}

export interface EmbeddingResult {
  readonly vectors: Float32Array[];
  readonly usage: OrUsage | null;
}

export const PHOTOS_EMBEDDING_PROVIDER: EmbeddingProvider = PHOTOS_PROVIDER;

const ANSWER = z.object({
  id: z.string().min(1).max(200).optional(),
  data: z.array(z.object({ index: z.int().nonnegative(), embedding: z.array(z.number()).min(1) })),
  usage: z
    .looseObject({
      prompt_tokens: z.int().nonnegative(),
      cost: z.number().nonnegative().nullish(),
    })
    .nullish(),
});

export class EmbeddingBatchError extends Error {
  override readonly name = 'EmbeddingBatchError';

  constructor(
    readonly expected: number,
    readonly received: readonly number[],
  ) {
    super('The embedding response did not contain exactly one vector per input.');
  }
}

export function truncateNormalised(vector: Float32Array, dimensions: number): Float32Array {
  const head = vector.slice(0, dimensions);
  let sum = 0;
  for (const value of head) sum += value * value;
  const norm = Math.sqrt(sum);
  return norm === 0 ? head : head.map((value) => value / norm);
}

function bodyOf(request: EmbeddingRequest): Record<string, unknown> {
  return {
    model: request.model,
    input: request.input,
    ...(request.dimensions === undefined ? {} : { dimensions: request.dimensions }),
    ...(request.provider === undefined ? {} : { provider: request.provider }),
  };
}

export class OpenRouterEmbeddings {
  constructor(
    private readonly client: OpenRouterClient,
    private readonly meter?: PhotosMeter,
  ) {}

  async embed(request: EmbeddingRequest): Promise<EmbeddingResult> {
    const answer = await this.client.retrying(
      (signal) =>
        this.client.json(
          {
            path: '/embeddings',
            method: 'POST',
            signal:
              request.signal === undefined ? signal : AbortSignal.any([signal, request.signal]),
            body: bodyOf(request),
          },
          ANSWER,
          'embeddings',
        ),
      request.signal,
    );
    const ordered = answer.data.toSorted((a, b) => a.index - b.index);
    if (
      ordered.length !== request.input.length ||
      ordered.some((row, index) => row.index !== index)
    )
      throw new EmbeddingBatchError(
        request.input.length,
        ordered.map((row) => row.index),
      );
    const usage: OrUsage | null =
      answer.usage === null || answer.usage === undefined
        ? null
        : {
            prompt_tokens: answer.usage.prompt_tokens,
            completion_tokens: 0,
            cost: answer.usage.cost ?? null,
          };
    this.record(request, usage, answer.id ?? null);
    return { vectors: ordered.map((row) => Float32Array.from(row.embedding)), usage };
  }

  async embedBatched(
    request: EmbeddingRequest,
    batchSize: number = EMBEDDING_BATCH_SIZE,
  ): Promise<Float32Array[]> {
    const vectors: Float32Array[] = [];
    for (let start = 0; start < request.input.length; start += batchSize) {
      const part = await this.embed({
        ...request,
        input: request.input.slice(start, start + batchSize),
      });
      vectors.push(...part.vectors);
    }
    return vectors;
  }

  private record(
    request: EmbeddingRequest,
    usage: OrUsage | null,
    generationId: string | null,
  ): void {
    if (this.meter === undefined || request.metering === undefined) return;
    this.meter(
      photosUsageEntry({
        profileId: request.metering.profileId,
        model: request.model,
        usage,
        generationId,
        kind: request.metering.kind,
        itemId: request.metering.itemId,
      }),
    );
  }
}
