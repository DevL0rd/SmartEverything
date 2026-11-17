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
import { currentItem, ignoreFailure, type AiEnvironment, type MediaItem } from './env';
import { placeNameOf } from './place';
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
    const item = currentItem(this.env, job);
    if (item === undefined) return;
    const subject = this.env.consent.subjectOfRoot(item.rootId);
    if (!this.env.consent.smartSearch(subject)) return;
    const analysis = this.env.store.photoAnalysis.find(item.id);
    if (analysis?.state !== 'done' || analysis.rev !== job.rev) return;
    const model = this.env.models.read().embedding;
    const text = describePhoto({
      analysis,
      takenAt: item.takenAt,
      place: placeNameOf(this.env.store.context, this.env.media.find(item.id)?.place_id ?? null),
    });
    const vector = await this.vectorOf({ job, item, subject, model }, text, signal);
    if (vector !== undefined) this.save({ job, item, subject, model }, vector);
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

  private save(target: Target, vector: Float32Array): void {
    const { job, item, subject, model } = target;
    const stored = quantise(vector);
    const embedding = {
      itemId: item.id,
      rev: item.rev,
      model,
      dims: vector.length,
      scale: stored.scale,
      vector: stored.bytes,
    };
    const written = this.env.store.write(() => {
      const now = this.env.store.driveItems.find(item.id, null);
      if (now?.rev !== job.rev || !this.env.consent.smartSearch(subject)) return false;
      this.env.store.photoEmbeddings.save(embedding);
      return true;
    });
    if (written) this.env.index.upsert(embedding);
  }
}
