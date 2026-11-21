import type { PhotoAiStage, PhotosAiNotice } from '@smarteverything/domain';
import type { StoreHost } from '../../store/host/host';
import type { DriveMediaJob, DriveMediaJobKind } from '../../store/repositories/drive-media-jobs';
import type { JobHandler, MediaJobRunner } from '../pipeline/jobs';
import type { AiJobRequest } from './job-units';

export type PhotoAiKind = 'faces' | 'vision' | 'embed' | 'pet_embed';

export const PHOTO_AI_KINDS: readonly PhotoAiKind[] = ['faces', 'vision', 'embed', 'pet_embed'];

export const STAGE_OF: Readonly<Record<PhotoAiKind, PhotoAiStage>> = {
  faces: 'faces',
  vision: 'tags',
  pet_embed: 'tags',
  embed: 'index',
};

export type JobRequester = Pick<MediaJobRunner, 'adopt'>;

export type AiNotice = (notice: PhotosAiNotice) => void;

export type AiRequest = Omit<AiJobRequest, 'rerun'>;

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
    private readonly host: StoreHost,
    private readonly runner: JobRequester,
    private readonly notice: AiNotice,
  ) {}

  onDrained(listener: (stage: PhotoAiStage) => void): () => void {
    this.drainListeners.add(listener);
    return (): void => {
      this.drainListeners.delete(listener);
    };
  }

  request(requests: readonly AiRequest[]): Promise<number> {
    return this.queue(requests.map((request) => ({ ...request, rerun: false })));
  }

  rerun(requests: readonly AiRequest[]): Promise<number> {
    return this.queue(requests.map((request) => ({ ...request, rerun: true })));
  }

  private async queue(requests: readonly AiJobRequest[]): Promise<number> {
    if (requests.length === 0) return 0;
    const jobs = await this.host.write('photoAiRequest', requests);
    for (const job of jobs) this.tally(kindOf(job.kind)).add(job.id);
    this.runner.adopt(jobs);
    return jobs.length;
  }

  started(job: DriveMediaJob): void {
    this.tally(kindOf(job.kind)).add(job.id);
  }

  async finished(job: DriveMediaJob): Promise<void> {
    const kind = kindOf(job.kind);
    const stage = STAGE_OF[kind];
    const tally = this.tally(kind);
    tally.finish(job.id);
    if (await this.busy(stage)) return;
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
      fail: (job, cause): Promise<void> => handler.fail(job, cause),
      settled: (job): Promise<void> => this.finished(job),
    };
  }

  private busy(stage: PhotoAiStage): Promise<boolean> {
    const kinds = PHOTO_AI_KINDS.filter((kind) => STAGE_OF[kind] === stage);
    return this.host.read('photoAiBusy', { kinds });
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
