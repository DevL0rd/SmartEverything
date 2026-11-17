import { readFile } from 'node:fs/promises';
import type { PhotoBox } from '@smarteverything/domain';
import sharp from 'sharp';
import {
  PHOTOS_EMBEDDING_PROVIDER,
  truncateNormalised,
  type EmbeddingInput,
} from '../../openrouter/embeddings';
import { needsKey } from '../../openrouter/vision';
import type { DriveMediaJob } from '../../store/repositories/drive-media-jobs';
import type { PhotoFaceRow } from '../../store/repositories/photo-faces';
import { derivedPath } from '../pipeline/derived-paths';
import type { JobHandler } from '../pipeline/jobs';
import { EMBEDDING_DIMENSIONS } from './defaults';
import { embeddingMetering, type EmbeddingClient } from './embed-job';
import { currentItem, ignoreFailure, type AiEnvironment } from './env';
import { float32Bytes } from './vectors';

interface Region {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export function regionOf(box: PhotoBox, width: number, height: number): Region {
  const left = Math.min(width - 1, Math.max(0, Math.floor(box.x * width)));
  const top = Math.min(height - 1, Math.max(0, Math.floor(box.y * height)));
  return {
    left,
    top,
    width: Math.max(1, Math.min(width - left, Math.round(box.w * width))),
    height: Math.max(1, Math.min(height - top, Math.round(box.h * height))),
  };
}

async function crops(preview: Buffer, boxes: readonly PhotoBox[]): Promise<EmbeddingInput[]> {
  const { width, height } = await sharp(preview).metadata();
  return Promise.all(
    boxes.map(async (box) => {
      const crop = await sharp(preview)
        .extract(regionOf(box, width, height))
        .jpeg({ quality: 85 })
        .toBuffer();
      return {
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${crop.toString('base64')}` },
          },
        ],
      } satisfies EmbeddingInput;
    }),
  );
}

export class PetEmbedHandler implements JobHandler {
  readonly resource = 'cloud';
  readonly fail = ignoreFailure;

  constructor(
    private readonly env: AiEnvironment,
    private readonly embeddings: EmbeddingClient,
    private readonly touched: (profileId: string) => void,
  ) {}

  async run(job: DriveMediaJob, signal: AbortSignal): Promise<void> {
    const item = currentItem(this.env, job);
    if (item === undefined) return;
    const subject = this.env.consent.subjectOfRoot(item.rootId);
    if (!this.env.consent.smartSearch(subject)) return;
    const analysis = this.env.store.photoAnalysis.find(item.id);
    if (analysis?.state !== 'done' || analysis.rev !== job.rev || analysis.pets.length === 0)
      return;
    const model = this.env.models.read().petEmbedding;
    const preview = await readFile(
      derivedPath(this.env.layout, { itemId: item.id, rev: item.rev, size: 'preview' }),
    );
    let vectors: Float32Array[];
    try {
      const result = await this.embeddings.embed({
        model,
        input: await crops(
          preview,
          analysis.pets.map((pet) => pet.box),
        ),
        dimensions: EMBEDDING_DIMENSIONS,
        provider: PHOTOS_EMBEDDING_PROVIDER,
        metering: embeddingMetering(subject, 'pet_embedding', item.id),
        signal,
      });
      vectors = result.vectors;
    } catch (cause) {
      if (needsKey(cause)) return;
      throw cause;
    }
    const rows = analysis.pets.map((pet, index): PhotoFaceRow => {
      const vector = vectors[index];
      if (vector === undefined) throw new Error(`No pet embedding came back for ${item.id}.`);
      return {
        id: this.env.newId(),
        itemId: item.id,
        rev: item.rev,
        kind: 'pet',
        species: pet.species,
        box: pet.box,
        landmarks: null,
        score: 1,
        quality: Math.min(1, pet.box.w * pet.box.h),
        model,
        vector: float32Bytes(truncateNormalised(vector, EMBEDDING_DIMENSIONS)),
      };
    });
    this.save(job, subject, rows);
  }

  private save(job: DriveMediaJob, subject: string, rows: readonly PhotoFaceRow[]): void {
    this.env.store.write(() => {
      const now = this.env.store.driveItems.find(job.item_id, null);
      if (now?.rev !== job.rev || !this.env.consent.smartSearch(subject)) return;
      this.env.store.photoFaces.replaceKindForItem(job.item_id, 'pet', rows);
      this.touched(subject);
    });
  }
}
