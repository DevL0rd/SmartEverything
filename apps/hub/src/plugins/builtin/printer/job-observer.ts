import type { PrinterActiveJob } from '@smarteverything/domain';
import { IppStatusError, type PrinterJob } from '@smarteverything/ipp';
import type { PrinterClient } from './client';
import type { PrinterLedger } from './ledger';
import type { JobRecord } from './records';

const BACKFILL_LIMIT = 50;
const OBSERVE_LIMIT = 50;
const TERMINAL: ReadonlySet<JobRecord['state']> = new Set(['completed', 'canceled', 'aborted']);

export interface JobNotice {
  readonly kind: 'job_started' | 'job_finished';
  readonly job: JobRecord;
}

export interface SubmittedInfo {
  readonly person: string | null;
  readonly name: string | null;
  readonly format: string | null;
  readonly copies: number | null;
  readonly colorMode: string | null;
  readonly sides: string | null;
}

export interface ObservedQueue {
  readonly active: PrinterActiveJob | null;
  readonly progress: number | null;
  readonly waiting: number;
}

export interface ObserverDeps {
  readonly client: Pick<PrinterClient, 'jobs' | 'job'>;
  readonly ledger: PrinterLedger;
  readonly epoch: () => number;
  readonly upTime: () => number | null;
  readonly now: () => Date;
  readonly notify: (notice: JobNotice) => void;
}

const NO_INFO: SubmittedInfo = {
  person: null,
  name: null,
  format: null,
  copies: null,
  colorMode: null,
  sides: null,
};

const NO_RECORD: JobRecord = {
  key: '',
  jobId: null,
  epoch: 0,
  origin: 'observed',
  person: null,
  name: null,
  state: 'pending',
  reasons: [],
  printerReasons: [],
  message: null,
  format: null,
  copies: null,
  colorMode: null,
  sides: null,
  pages: null,
  sheets: null,
  color: null,
  mono: null,
  kOctets: null,
  createdAt: null,
  startedAt: null,
  completedAt: null,
  counted: false,
};

function firstOf<T>(...values: readonly (T | null | undefined)[]): T | null {
  for (const value of values) if (value !== null && value !== undefined) return value;
  return null;
}

export function progressOf(job: PrinterJob): number | null {
  if (job.progress !== null) return Math.max(0, Math.min(100, job.progress));
  if (job.impressions === null || job.impressions <= 0 || job.impressionsDone === null) return null;
  return Math.max(0, Math.min(100, Math.round((job.impressionsDone / job.impressions) * 100)));
}

function activeOf(record: JobRecord, job: PrinterJob): PrinterActiveJob | null {
  if (job.state === 'processing' || job.state === 'stopped' || job.state === 'held') {
    return {
      pages: job.impressions,
      pagesDone: job.impressionsDone,
      startedAt: record.startedAt,
      state: job.state,
    };
  }
  return null;
}

export class JobObserver {
  readonly #open = new Map<number, string>();
  readonly #started = new Set<string>();

  constructor(private readonly deps: ObserverDeps) {}

  get tracking(): boolean {
    return this.#open.size > 0;
  }

  registerSubmitted(job: PrinterJob | null, info: SubmittedInfo): JobRecord | null {
    if (job === null) return null;
    const record = this.#merge(job, null, info);
    this.deps.ledger.saveJob(record);
    this.#open.set(job.id, record.key);
    return record;
  }

  #instant(printerTime: number | null, date: string | null): string | null {
    if (date !== null) return date;
    const upTime = this.deps.upTime();
    if (printerTime === null || upTime === null) return null;
    return new Date(this.deps.now().getTime() - (upTime - printerTime) * 1000).toISOString();
  }

  #keyOf(job: PrinterJob): string {
    const byId = `${String(this.deps.epoch())}:${String(job.id)}`;
    if (job.uuid !== null && this.deps.ledger.job(job.uuid) !== null) return job.uuid;
    if (this.deps.ledger.job(byId) !== null) return byId;
    return job.uuid ?? byId;
  }

  #times(job: PrinterJob): Pick<JobRecord, 'createdAt' | 'startedAt' | 'completedAt'> {
    const completed = this.#instant(job.completedAt, job.completedDate);
    return {
      createdAt: this.#instant(job.createdAt, job.createdDate),
      startedAt: this.#instant(job.startedAt, job.startedDate),
      completedAt: completed ?? (TERMINAL.has(job.state) ? this.deps.now().toISOString() : null),
    };
  }

  #merge(job: PrinterJob, existing: JobRecord | null, info: SubmittedInfo | null): JobRecord {
    const times = this.#times(job);
    const prior = existing ?? NO_RECORD;
    const given = info ?? NO_INFO;
    const pages = firstOf(job.impressionsDone, job.impressions, prior.pages);
    return {
      key: existing === null ? this.#keyOf(job) : prior.key,
      jobId: job.id,
      epoch: this.deps.epoch(),
      origin: existing === null ? (info === null ? 'observed' : 'hub') : prior.origin,
      person: firstOf(prior.person, given.person),
      name: firstOf(prior.name, given.name),
      state: job.state,
      reasons: [...job.reasons],
      printerReasons: [...job.printerReasons],
      message: job.message,
      format: firstOf(prior.format, given.format, job.format),
      copies: firstOf(prior.copies, given.copies, job.copies),
      colorMode: firstOf(prior.colorMode, given.colorMode),
      sides: firstOf(prior.sides, given.sides),
      pages: TERMINAL.has(job.state) ? pages : firstOf(job.impressions, pages),
      sheets: firstOf(job.sheetsDone, job.sheets, prior.sheets),
      color: firstOf(job.color, prior.color),
      mono: firstOf(job.mono, prior.mono),
      kOctets: job.kOctets,
      createdAt: firstOf(prior.createdAt, times.createdAt),
      startedAt: firstOf(prior.startedAt, times.startedAt),
      completedAt: times.completedAt,
      counted: prior.counted,
    };
  }

  #recordOf(job: PrinterJob): JobRecord {
    return this.#merge(job, this.deps.ledger.job(this.#keyOf(job)), null);
  }

  #settle(record: JobRecord): void {
    this.deps.ledger.saveJob(record);
    if (TERMINAL.has(record.state)) {
      if (record.jobId !== null) this.#open.delete(record.jobId);
      this.deps.notify({ kind: 'job_finished', job: record });
    }
  }

  async observe(): Promise<ObservedQueue> {
    const jobs = await this.deps.client.jobs({
      which: 'not-completed',
      limit: OBSERVE_LIMIT,
      mine: false,
    });
    const seen = new Set<number>();
    let active: PrinterActiveJob | null = null;
    let progress: number | null = null;
    let waiting = 0;
    for (const job of jobs) {
      seen.add(job.id);
      const record = this.#recordOf(job);
      this.#open.set(job.id, record.key);
      this.deps.ledger.saveJob(record);
      this.#announce(record);
      const current = activeOf(record, job);
      if (current !== null && active === null) {
        active = current;
        progress = progressOf(job);
      } else if (job.state === 'pending' || job.state === 'held') {
        waiting += 1;
      }
    }
    await this.#vanished(seen);
    return { active, progress, waiting };
  }

  #announce(record: JobRecord): void {
    if (record.state !== 'processing' || this.#started.has(record.key)) return;
    this.#started.add(record.key);
    this.deps.notify({ kind: 'job_started', job: record });
  }

  async #vanished(seen: ReadonlySet<number>): Promise<void> {
    for (const [jobId, key] of [...this.#open]) {
      if (seen.has(jobId)) continue;
      const known = this.deps.ledger.job(key);
      if (known === null) {
        this.#open.delete(jobId);
        continue;
      }
      const final = await this.#finalOf(jobId);
      this.#settle(final === null ? this.#assumedDone(known) : this.#merge(final, known, null));
    }
  }

  #assumedDone(known: JobRecord): JobRecord {
    return {
      ...known,
      state: 'completed',
      completedAt: this.deps.now().toISOString(),
      pages: known.pages,
    };
  }

  async #finalOf(jobId: number): Promise<PrinterJob | null> {
    try {
      const job = await this.deps.client.job(jobId);
      return job !== null && TERMINAL.has(job.state) ? job : null;
    } catch (cause) {
      if (cause instanceof IppStatusError) return null;
      throw cause;
    }
  }

  async backfill(): Promise<number> {
    const jobs = await this.deps.client.jobs({
      which: 'completed',
      limit: BACKFILL_LIMIT,
      mine: false,
    });
    let added = 0;
    for (const job of jobs) {
      const key = this.#keyOf(job);
      if (this.deps.ledger.job(key) !== null) continue;
      this.deps.ledger.saveJob(this.#merge(job, null, null));
      added += 1;
    }
    return added;
  }
}
