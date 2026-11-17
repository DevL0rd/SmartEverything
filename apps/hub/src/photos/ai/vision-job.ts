import { readFile, stat } from 'node:fs/promises';
import { messageOf } from '@smarteverything/logging';
import { fsCode } from '../../fs-code';
import type { VisionAnalysis, VisionOutcome, VisionRequest } from '../../openrouter/vision';
import type { DriveMediaJob } from '../../store/repositories/drive-media-jobs';
import { derivedPath, DERIVED_MIME } from '../pipeline/derived-paths';
import type { JobHandler } from '../pipeline/jobs';
import { playableCopyPath } from '../pipeline/playable';
import { searchWords } from './description';
import { currentItem, type AiEnvironment, type MediaItem } from './env';

export interface VisionClient {
  readonly analyse: (request: VisionRequest) => Promise<VisionOutcome>;
}

interface Settled {
  readonly job: DriveMediaJob;
  readonly item: MediaItem;
  readonly subject: string;
  readonly model: string;
}

interface Payload {
  readonly mime: string;
  readonly data: Buffer;
}

async function exists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).size > 0;
  } catch (cause) {
    if (fsCode(cause) === 'ENOENT') return false;
    throw cause;
  }
}

export class VisionHandler implements JobHandler {
  readonly resource = 'io';

  constructor(
    private readonly env: AiEnvironment,
    private readonly vision: VisionClient,
  ) {}

  async run(job: DriveMediaJob, signal: AbortSignal): Promise<void> {
    const item = currentItem(this.env, job);
    if (item === undefined) return;
    const subject = this.env.consent.subjectOfRoot(item.rootId);
    if (!this.env.consent.smartSearch(subject)) return;
    const model = this.env.models.read().vision;
    const payload = await this.payload(item);
    const outcome = await this.vision.analyse({
      profileId: subject,
      itemId: item.id,
      model,
      mime: payload.mime,
      data: payload.data,
      signal,
    });
    const analysis = outcome.state === 'done' ? outcome.analysis : null;
    if (this.settle({ job, item, subject, model }, analysis)) this.next(item);
  }

  fail(job: DriveMediaJob, cause: unknown): void {
    const item = this.env.store.driveItems.find(job.item_id, null);
    if (item?.rev !== job.rev) return;
    this.env.log.warn('analysis.failed', { itemId: job.item_id, reason: messageOf(cause) });
    this.env.store.photoAnalysis.save({
      itemId: job.item_id,
      rev: job.rev,
      model: this.env.models.read().vision,
      state: 'failed',
      caption: null,
      scene: null,
      labels: [],
      text: null,
      pets: [],
      error: messageOf(cause),
    });
  }

  private async payload(item: MediaItem): Promise<Payload> {
    if (item.kind === 'video' && this.env.media.find(item.id)?.playable_state === 'ready')
      return { mime: 'video/mp4', data: await readFile(await this.playable(item)) };
    return {
      mime: DERIVED_MIME,
      data: await readFile(
        derivedPath(this.env.layout, { itemId: item.id, rev: item.rev, size: 'preview' }),
      ),
    };
  }

  private async playable(item: MediaItem): Promise<string> {
    for (const copy of ['fullHd', 'full'] as const) {
      const path = playableCopyPath(this.env.layout, item.id, item.rev, copy);
      if (await exists(path)) return path;
    }
    return this.env.locate(item);
  }

  private settle(target: Settled, analysis: VisionAnalysis | null): boolean {
    const { job, item, subject, model } = target;
    return this.env.store.write(() => {
      const now = this.env.store.driveItems.find(item.id, null);
      if (now?.rev !== job.rev || !this.env.consent.smartSearch(subject)) return false;
      const base = { itemId: item.id, rev: item.rev, model, error: null };
      if (analysis === null) {
        this.env.store.photoAnalysis.save({
          ...base,
          state: 'needs_key',
          caption: null,
          scene: null,
          labels: [],
          text: null,
          pets: [],
        });
        return false;
      }
      this.env.store.photoAnalysis.save({ ...base, state: 'done', ...analysis });
      this.env.labels.write(now, searchWords(analysis));
      if (analysis.pets.length === 0)
        this.env.store.photoFaces.replaceKindForItem(item.id, 'pet', []);
      this.env.log.debug('analysis.done', {
        itemId: item.id,
        labels: analysis.labels.length,
        pets: analysis.pets.length,
      });
      return true;
    });
  }

  private next(item: MediaItem): void {
    const models = this.env.models.read();
    this.env.queue.rerun('embed', item.id, item.rev, models.embedding);
    const analysis = this.env.store.photoAnalysis.find(item.id);
    if (analysis !== undefined && analysis.pets.length > 0)
      this.env.queue.rerun('pet_embed', item.id, item.rev, models.petEmbedding);
  }
}
