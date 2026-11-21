import { availableParallelism } from 'node:os';
import { background, messageOf, type Logger } from '@smarteverything/logging';
import sharp from 'sharp';
import { vaapiDevice } from '../../media/ffmpeg-path';
import type {
  DriveMediaJob,
  DriveMediaJobKind,
  DriveMediaJobRequest,
} from '../../store/repositories/drive-media-jobs';
import type { JobStore } from './job-units';

export type PipelineResource = 'image' | 'video' | 'io' | 'cloud' | 'accelerator';

type LimitedResource = Exclude<PipelineResource, 'accelerator'>;

export interface JobHandler {
  readonly resource: PipelineResource;
  readonly run: (job: DriveMediaJob, signal: AbortSignal) => Promise<void>;
  readonly fail: (job: DriveMediaJob, cause: unknown) => Promise<void>;
  readonly capacity?: () => number;
  readonly settled?: (job: DriveMediaJob) => Promise<void>;
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

export type ResourceLimits = Readonly<Record<LimitedResource, number>>;

export interface RunnerEnvironment {
  readonly jobs: JobStore;
  readonly limits: ResourceLimits;
  readonly progress: ProgressEmitter;
  readonly log: Logger;
}

export const QUICK_SYNC_SESSIONS = 3;

export const CLOUD_REQUESTS = 16;

export function backgroundThreads(): number {
  return Math.max(1, Math.floor(availableParallelism() / 2));
}

export function defaultLimits(): ResourceLimits {
  const cores = availableParallelism();
  return {
    image: cores,
    video: vaapiDevice() === null ? backgroundThreads() : QUICK_SYNC_SESSIONS,
    io: Math.max(1, Math.floor(cores / 4)),
    cloud: CLOUD_REQUESTS,
  };
}

let sharpConfigured = false;

export function configureSharp(): void {
  if (sharpConfigured) return;
  sharpConfigured = true;
  sharp.concurrency(1);
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

const RESOURCES = ['image', 'video', 'io', 'cloud', 'accelerator'] as const;

export class MediaJobRunner {
  private readonly handlers = new Map<DriveMediaJobKind, JobHandler>();
  private readonly running: Record<PipelineResource, number> = {
    image: 0,
    video: 0,
    io: 0,
    cloud: 0,
    accelerator: 0,
  };
  private readonly tallies = new Map<ProgressKind, ProgressTally>();
  private readonly waiting: (() => void)[] = [];
  private readonly touchListeners = new Set<(itemId: string) => void>();
  private readonly abort = new AbortController();
  private started = false;
  private claiming = false;
  private again = false;

  constructor(private readonly env: RunnerEnvironment) {
    configureSharp();
  }

  register(kind: DriveMediaJobKind, handler: JobHandler): void {
    if (this.handlers.has(kind))
      throw new Error(`the media job kind ${kind} is already registered`);
    if (handler.resource === 'accelerator' && handler.capacity === undefined)
      throw new Error(`the accelerator job kind ${kind} has no capacity`);
    this.handlers.set(kind, handler);
  }

  async start(): Promise<void> {
    await this.env.jobs.requeueRunning();
    this.started = true;
    this.pump();
  }

  async request(request: DriveMediaJobRequest): Promise<DriveMediaJob> {
    const job = await this.env.jobs.enqueue(request);
    this.tallyOf(job.kind)?.add(job);
    this.pump();
    return job;
  }

  adopt(jobs: readonly DriveMediaJob[]): void {
    for (const job of jobs) this.tallyOf(job.kind)?.add(job);
    this.pump();
  }

  onTouched(listener: (itemId: string) => void): () => void {
    this.touchListeners.add(listener);
    return (): void => {
      this.touchListeners.delete(listener);
    };
  }

  touched(itemId: string): void {
    for (const listener of this.touchListeners) listener(itemId);
  }

  async itemChanged(itemId: string, rev: number): Promise<void> {
    await this.env.jobs.removeOlderRevisions(itemId, rev);
  }

  async prioritise(itemId: string): Promise<void> {
    await this.env.jobs.makeVisible(itemId);
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
    return (
      (this.claiming ? 1 : 0) +
      this.running.image +
      this.running.video +
      this.running.io +
      this.running.cloud +
      this.running.accelerator
    );
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

  private limitOf(resource: PipelineResource): number {
    if (resource !== 'accelerator') return this.env.limits[resource];
    const capacities = [...this.handlers.values()].flatMap((handler) =>
      handler.resource === 'accelerator' && handler.capacity !== undefined
        ? [handler.capacity()]
        : [],
    );
    return Math.min(...capacities);
  }

  private pump(): void {
    if (!this.started || this.abort.signal.aborted) return;
    if (this.claiming) {
      this.again = true;
      return;
    }
    this.claiming = true;
    background(this.claimFree(), 'photos.job_claim_failed');
  }

  private async claimFree(): Promise<void> {
    this.again = true;
    try {
      while (this.takeAgain() && !this.abort.signal.aborted) {
        const resources = RESOURCES.map((resource) => ({
          resource,
          kinds: this.kindsOf(resource),
          count: this.limitOf(resource) - this.running[resource],
        })).filter(({ kinds, count }) => kinds.length > 0 && count > 0);
        if (resources.length === 0) continue;
        const claimed = await this.env.jobs.claim(
          resources.map(({ kinds, count }) => ({ kinds, count })),
        );
        resources.forEach(({ resource }, index) => {
          const jobs = claimed.at(index);
          if (jobs === undefined) throw new Error(`the ${resource} job claim has no answer`);
          for (const job of jobs) this.launch(resource, job);
        });
      }
    } finally {
      this.claiming = false;
      this.release();
    }
  }

  private takeAgain(): boolean {
    const again = this.again;
    this.again = false;
    return again;
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
      await this.env.jobs.complete(job.id);
    } catch (cause) {
      await this.failed(handler, job, cause);
    } finally {
      this.tallyOf(job.kind)?.finish(job);
      try {
        await handler.settled?.(job);
      } finally {
        this.running[resource] -= 1;
        this.pump();
        this.release();
        this.touched(job.item_id);
      }
    }
  }

  private async failed(handler: JobHandler, job: DriveMediaJob, cause: unknown): Promise<void> {
    if (this.abort.signal.aborted) return;
    const reason = messageOf(cause);
    this.env.log.warn('photos.job_failed', {
      jobId: job.id,
      kind: job.kind,
      itemId: job.item_id,
      reason,
    });
    await this.env.jobs.fail(job.id, reason);
    await handler.fail(job, cause);
  }

  private release(): void {
    if (this.busy() > 0) return;
    for (const resolve of this.waiting.splice(0)) resolve();
  }
}
