import { randomUUID } from 'node:crypto';
import { ApiError, type EditJob } from '@smarteverything/domain';

export const FINISHED_KEEP_MS = 3_600_000;

export const PROGRESS_NOTICE_MS = 500;

interface Entry {
  readonly id: string;
  readonly itemId: string;
  readonly profileId: string;
  readonly state: EditJob['state'];
  readonly progress: number;
  readonly resultItemId: string | null;
  readonly error: string | null;
  readonly finishedAt: number | null;
  readonly noticeAt: number;
}

export class EditJobs {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly now: () => Date,
    private readonly announce: (profileId: string, job: EditJob) => void,
  ) {}

  create(itemId: string, profileId: string): string {
    this.forget();
    const id = randomUUID();
    this.entries.set(id, {
      id,
      itemId,
      profileId,
      state: 'queued',
      progress: 0,
      resultItemId: null,
      error: null,
      finishedAt: null,
      noticeAt: this.now().getTime(),
    });
    this.publish(id);
    return id;
  }

  running(id: string): void {
    this.change(id, { state: 'running' });
  }

  progress(id: string, fraction: number): void {
    const entry = this.entries.get(id);
    if (entry === undefined) return;
    const progress = Math.min(0.999, Math.max(0, fraction));
    if (this.now().getTime() - entry.noticeAt < PROGRESS_NOTICE_MS) {
      this.entries.set(id, { ...entry, progress });
      return;
    }
    this.change(id, { progress });
  }

  done(id: string, resultItemId: string): void {
    this.change(id, {
      state: 'done',
      progress: 1,
      resultItemId,
      finishedAt: this.now().getTime(),
    });
  }

  fail(id: string, error: string): void {
    this.change(id, { state: 'failed', error, finishedAt: this.now().getTime() });
  }

  read(id: string, profileId: string): EditJob {
    const entry = this.entries.get(id);
    if (entry?.profileId !== profileId) {
      throw new ApiError('not_found', 'There is no such edit job.');
    }
    return this.view(entry);
  }

  private change(id: string, patch: Partial<Entry>): void {
    const entry = this.entries.get(id);
    if (entry === undefined) return;
    this.entries.set(id, { ...entry, ...patch, noticeAt: this.now().getTime() });
    this.publish(id);
  }

  private publish(id: string): void {
    const entry = this.entries.get(id);
    if (entry !== undefined) this.announce(entry.profileId, this.view(entry));
  }

  private view(entry: Entry): EditJob {
    return {
      id: entry.id,
      itemId: entry.itemId,
      state: entry.state,
      progress: entry.progress,
      resultItemId: entry.resultItemId,
      error: entry.error,
    };
  }

  private forget(): void {
    const cutoff = this.now().getTime() - FINISHED_KEEP_MS;
    for (const [id, entry] of this.entries) {
      if (entry.finishedAt !== null && entry.finishedAt < cutoff) this.entries.delete(id);
    }
  }
}
