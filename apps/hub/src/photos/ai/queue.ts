import type { PhotoAiStage, PhotosAiNotice } from '@smarteverything/domain';
import { z } from 'zod';
import type { StoreContext } from '../../store/context';
import type {
  DriveMediaJob,
  DriveMediaJobKind,
  DriveMediaJobRequest,
} from '../../store/repositories/drive-media-jobs';
import { inList } from '../../store/sql';
import type { JobHandler } from '../pipeline/jobs';

export type PhotoAiKind = 'faces' | 'vision' | 'embed' | 'pet_embed';

export const PHOTO_AI_KINDS: readonly PhotoAiKind[] = ['faces', 'vision', 'embed', 'pet_embed'];

export const STAGE_OF: Readonly<Record<PhotoAiKind, PhotoAiStage>> = {
  faces: 'faces',
  vision: 'tags',
  pet_embed: 'tags',
  embed: 'index',
};

export interface JobRequester {
  readonly request: (request: DriveMediaJobRequest) => DriveMediaJob;
}

export type AiNotice = (notice: PhotosAiNotice) => void;

const PRESENT = z.strictObject({ found: z.int() });

class StageTally {
  private readonly pending = new Set<string>();
  private finished = 0;

  constructor(
    private readonly stage: PhotoAiStage,
    private readonly emit: AiNotice,
  ) {}

  add(jobId: string): void {
    if (this.pending.has(jobId)) return;
    this.pending.add(jobId);
    this.publish();
  }

  finish(jobId: string): void {
    if (!this.pending.delete(jobId)) return;
    this.finished += 1;
    this.publish();
  }

  reset(): void {
    const stale = this.pending.size > 0;
    this.pending.clear();
    if (stale) this.publish();
    this.finished = 0;
  }

  private publish(): void {
    this.emit({
      type: 'photos_ai',
      stage: this.stage,
      done: this.finished,
      total: this.finished + this.pending.size,
    });
  }
}

export class PhotoAiQueue {
  private readonly tallies = new Map<PhotoAiStage, StageTally>();
  private readonly drainListeners = new Set<(stage: PhotoAiStage) => void>();

  constructor(
    private readonly context: StoreContext,
    private readonly runner: JobRequester,
    private readonly notice: AiNotice,
  ) {}

  onDrained(listener: (stage: PhotoAiStage) => void): () => void {
    this.drainListeners.add(listener);
    return (): void => {
      this.drainListeners.delete(listener);
    };
  }

  request(kind: PhotoAiKind, itemId: string, rev: number, modelVersion: string): boolean {
    if (this.exists(kind, itemId, rev)) return false;
    const job = this.runner.request({ kind, itemId, rev, modelVersion });
    this.tally(kind).add(job.id);
    return true;
  }

  rerun(kind: PhotoAiKind, itemId: string, rev: number, modelVersion: string): boolean {
    this.context.sql.run(
      'forget the finished photo AI job so it can run again',
      `delete from drive_media_jobs
        where item_id = $itemId and rev = $rev and kind = $kind and state in ('done', 'failed')`,
      { itemId, rev, kind },
    );
    return this.request(kind, itemId, rev, modelVersion);
  }

  started(job: DriveMediaJob): void {
    this.tally(kindOf(job.kind)).add(job.id);
  }

  finished(job: DriveMediaJob): void {
    const kind = kindOf(job.kind);
    const stage = STAGE_OF[kind];
    const tally = this.tally(kind);
    tally.finish(job.id);
    if (this.busy(stage)) return;
    tally.reset();
    for (const listener of this.drainListeners) listener(stage);
  }

  tracked(handler: JobHandler): JobHandler {
    return {
      resource: handler.resource,
      ...(handler.capacity === undefined ? {} : { capacity: handler.capacity.bind(handler) }),
      run: async (job, signal): Promise<void> => {
        this.started(job);
        await handler.run(job, signal);
      },
      fail: (job, cause): void => {
        handler.fail(job, cause);
      },
      settled: (job): void => {
        this.finished(job);
      },
    };
  }

  private busy(stage: PhotoAiStage): boolean {
    const kinds = PHOTO_AI_KINDS.filter((kind) => STAGE_OF[kind] === stage);
    const filter = inList('kind', 'kinds', kinds);
    return (
      this.context.sql.get(
        PRESENT,
        `select 1 as found from drive_media_jobs
          where state in ('queued', 'running') and ${filter.text} limit 1`,
        filter.parameters,
      ) !== undefined
    );
  }

  private exists(kind: PhotoAiKind, itemId: string, rev: number): boolean {
    return (
      this.context.sql.get(
        PRESENT,
        `select 1 as found from drive_media_jobs
          where item_id = $itemId and rev = $rev and kind = $kind`,
        { itemId, rev, kind },
      ) !== undefined
    );
  }

  private tally(kind: PhotoAiKind): StageTally {
    const stage = STAGE_OF[kind];
    const known = this.tallies.get(stage);
    if (known !== undefined) return known;
    const created = new StageTally(stage, this.notice);
    this.tallies.set(stage, created);
    return created;
  }
}

export class NotPhotoAiJobError extends Error {
  override readonly name = 'NotPhotoAiJobError';

  constructor(readonly kind: DriveMediaJobKind) {
    super(`The media job kind ${kind} is not a Photos AI job.`);
  }
}

function kindOf(kind: DriveMediaJobKind): PhotoAiKind {
  const found = PHOTO_AI_KINDS.find((known) => known === kind);
  if (found === undefined) throw new NotPhotoAiJobError(kind);
  return found;
}
