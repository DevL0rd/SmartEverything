import {
  PHOTOS_EMBEDDING_PROVIDER,
  truncateNormalised,
  type EmbeddingMetering,
  type EmbeddingRequest,
  type EmbeddingResult,
} from '../../openrouter/embeddings';
import { needsKey } from '../../openrouter/vision';
import type { DriveMediaJob } from '../../store/repositories/drive-media-jobs';
import type { JobHandler } from '../pipeline/jobs';
import { EMBEDDING_DIMENSIONS } from './defaults';
import { describePhoto } from './description';
import { ignoreFailure, sourceOf, type AiEnvironment, type MediaItem } from './env';
import { quantise } from './vectors';

export interface EmbeddingClient {
  readonly embed: (request: EmbeddingRequest) => Promise<EmbeddingResult>;
}

export function embeddingMetering(
  profileId: string,
  kind: EmbeddingMetering['kind'],
  itemId: string | null,
): EmbeddingMetering {
  return { profileId, kind, itemId };
}

interface Target {
  readonly job: DriveMediaJob;
  readonly item: MediaItem;
  readonly subject: string;
  readonly model: string;
}

export class EmbedHandler implements JobHandler {
  readonly resource = 'cloud';
  readonly fail = ignoreFailure;

  constructor(
    private readonly env: AiEnvironment,
    private readonly embeddings: EmbeddingClient,
  ) {}

  async run(job: DriveMediaJob, signal: AbortSignal): Promise<void> {
    const source = await sourceOf(this.env, job);
    if (source?.switches.smartSearch !== true) return;
    const { item, subject, analysis } = source;
    if (analysis?.state !== 'done' || analysis.rev !== job.rev) return;
    const model = source.models.embedding;
    const text = describePhoto({ analysis, takenAt: item.takenAt, place: source.place });
    const vector = await this.vectorOf({ job, item, subject, model }, text, signal);
    if (vector !== undefined) await this.save({ job, item, subject, model }, vector);
  }

  private async vectorOf(
    target: Target,
    text: string,
    signal: AbortSignal,
  ): Promise<Float32Array | undefined> {
    try {
      const result = await this.embeddings.embed({
        model: target.model,
        input: [text],
        dimensions: EMBEDDING_DIMENSIONS,
        provider: PHOTOS_EMBEDDING_PROVIDER,
        metering: embeddingMetering(target.subject, 'embedding', target.item.id),
        signal,
      });
      const [vector] = result.vectors;
      if (vector === undefined)
        throw new Error(`No embedding came back for the photo ${target.item.id}.`);
      return truncateNormalised(vector, EMBEDDING_DIMENSIONS);
    } catch (cause) {
      if (needsKey(cause)) return undefined;
      throw cause;
    }
  }

  private async save(target: Target, vector: Float32Array): Promise<void> {
    const { item, subject, model } = target;
    const stored = quantise(vector);
    const embedding = {
      itemId: item.id,
      rev: item.rev,
      model,
      dims: vector.length,
      scale: stored.scale,
      vector: stored.bytes,
    };
    const written = await this.env.host.write('photoEmbeddingSave', { subject, embedding });
    if (written) this.env.index.upsert(embedding);
  }
}
