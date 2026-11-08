import { availableParallelism } from 'node:os';
import type { DriveItem } from '@smarteverything/domain';
import { background, messageOf, type Logger } from '@smarteverything/logging';
import sharp from 'sharp';
import type {
  DriveMediaJob,
  DriveMediaJobKind,
  DriveMediaJobRequest,
  DriveMediaJobsRepository,
} from '../../store/repositories/drive-media-jobs';

export type PipelineResource = 'cpu' | 'io';

export interface JobHandler {
  readonly resource: PipelineResource;
  readonly run: (job: DriveMediaJob, signal: AbortSignal) => Promise<void>;
  readonly fail: (job: DriveMediaJob, cause: unknown) => void;
}

export const PROGRESS_KINDS = ['preview', 'poster', 'playable'] as const;

export type ProgressKind = (typeof PROGRESS_KINDS)[number];

export interface PipelineProgress {
  readonly kind: ProgressKind;
  readonly itemId?: string;
  readonly done: number;
  readonly total: number;
}

export type ProgressEmitter = (progress: PipelineProgress) => void;

export type ResourceLimits = Readonly<Record<PipelineResource, number>>;

export type JobStore = Pick<
  DriveMediaJobsRepository,
  | 'claim'
  | 'complete'
  | 'fail'
  | 'enqueue'
  | 'makeVisible'
  | 'requeueRunning'
  | 'removeOlderRevisions'
>;

export interface RunnerEnvironment {
  readonly jobs: JobStore;
  readonly limits: ResourceLimits;
  readonly progress: ProgressEmitter;
  readonly log: Logger;
}

export function defaultLimits(): ResourceLimits {
  const cores = availableParallelism();
  return { cpu: Math.max(1, Math.floor(cores / 2)), io: Math.max(1, Math.floor(cores / 4)) };
}

let sharpConfigured = false;

export function configureSharp(concurrency: number): void {
  if (sharpConfigured) return;
  sharpConfigured = true;
  sharp.concurrency(concurrency);
}

function progressKindOf(kind: DriveMediaJobKind): ProgressKind | undefined {
  return PROGRESS_KINDS.find((known) => known === kind);
}

class ProgressTally {
  private readonly pending = new Set<string>();
  private finished = 0;

  constructor(
    private readonly kind: ProgressKind,
    private readonly emit: ProgressEmitter,
  ) {}

  add(job: DriveMediaJob): void {
    if (job.state !== 'queued' || this.pending.has(job.id)) return;
    this.pending.add(job.id);
    this.publish();
  }

  finish(job: DriveMediaJob): void {
    if (!this.pending.delete(job.id)) return;
    this.finished += 1;
    this.publish(this.kind === 'playable' ? job.item_id : undefined);
    if (this.pending.size === 0) this.finished = 0;
  }

  private publish(itemId?: string): void {
    this.emit({
      kind: this.kind,
      ...(itemId === undefined ? {} : { itemId }),
      done: this.finished,
      total: this.finished + this.pending.size,
    });
  }
}

export class MediaJobRunner {
  private readonly handlers = new Map<DriveMediaJobKind, JobHandler>();
  private readonly running: Record<PipelineResource, number> = { cpu: 0, io: 0 };
  private readonly tallies = new Map<ProgressKind, ProgressTally>();
  private readonly waiting: (() => void)[] = [];
  private readonly abort = new AbortController();
  private started = false;

  constructor(private readonly env: RunnerEnvironment) {
    configureSharp(env.limits.cpu);
  }

  register(kind: DriveMediaJobKind, handler: JobHandler): void {
    if (this.handlers.has(kind))
      throw new Error(`the media job kind ${kind} is already registered`);
    this.handlers.set(kind, handler);
  }

  start(): void {
    this.started = true;
    this.env.jobs.requeueRunning();
    this.pump();
  }

  request(request: DriveMediaJobRequest): DriveMediaJob {
    const job = this.env.jobs.enqueue(request);
    this.tallyOf(job.kind)?.add(job);
    this.pump();
    return job;
  }

  itemChanged(item: DriveItem): void {
    this.env.jobs.removeOlderRevisions(item.id, item.rev);
  }

  prioritise(itemId: string): void {
    this.env.jobs.makeVisible(itemId);
    this.pump();
  }

  resume(): void {
    this.pump();
  }

  idle(): Promise<void> {
    if (this.busy() === 0) return Promise.resolve();
    return new Promise((resolve) => {
      this.waiting.push(resolve);
    });
  }

  async stop(): Promise<void> {
    this.abort.abort();
    await this.idle();
  }

  private busy(): number {
    return this.running.cpu + this.running.io;
  }

  private tallyOf(kind: DriveMediaJobKind): ProgressTally | undefined {
    const progressKind = progressKindOf(kind);
    if (progressKind === undefined) return undefined;
    const known = this.tallies.get(progressKind);
    if (known !== undefined) return known;
    const created = new ProgressTally(progressKind, this.env.progress);
    this.tallies.set(progressKind, created);
    return created;
  }

  private kindsOf(resource: PipelineResource): DriveMediaJobKind[] {
    return [...this.handlers]
      .filter(([, handler]) => handler.resource === resource)
      .map(([kind]) => kind);
  }

  private pump(): void {
    if (!this.started || this.abort.signal.aborted) return;
    for (const resource of ['cpu', 'io'] as const) {
      const kinds = this.kindsOf(resource);
      while (kinds.length > 0 && this.running[resource] < this.env.limits[resource]) {
        const job = this.env.jobs.claim(kinds);
        if (job === undefined) break;
        this.launch(resource, job);
      }
    }
  }

  private launch(resource: PipelineResource, job: DriveMediaJob): void {
    const handler = this.handlers.get(job.kind);
    if (handler === undefined) throw new Error(`no handler for the media job kind ${job.kind}`);
    this.tallyOf(job.kind)?.add({ ...job, state: 'queued' });
    this.running[resource] += 1;
    background(this.execute(resource, handler, job), 'photos.job_crashed', {
      jobId: job.id,
      kind: job.kind,
    });
  }

  private async execute(
    resource: PipelineResource,
    handler: JobHandler,
    job: DriveMediaJob,
  ): Promise<void> {
    try {
      await handler.run(job, this.abort.signal);
      this.env.jobs.complete(job.id);
    } catch (cause) {
      this.failed(handler, job, cause);
    } finally {
      this.running[resource] -= 1;
      this.tallyOf(job.kind)?.finish(job);
      this.pump();
      this.release();
    }
  }

  private failed(handler: JobHandler, job: DriveMediaJob, cause: unknown): void {
    if (this.abort.signal.aborted) return;
    const reason = messageOf(cause);
    this.env.log.warn('photos.job_failed', {
      jobId: job.id,
      kind: job.kind,
      itemId: job.item_id,
      reason,
    });
    this.env.jobs.fail(job.id, reason);
    handler.fail(job, cause);
  }

  private release(): void {
    if (this.busy() > 0) return;
    for (const resolve of this.waiting.splice(0)) resolve();
  }
}
