import type { PrinterJob } from '@smarteverything/domain';
import { clockLabel, countLabel } from './format';

export type JobCardKind = 'printing' | 'stopped' | 'offline' | 'held' | 'waiting';

export type PrinterHalt = 'ready' | 'stopped' | 'offline';

export interface JobCard {
  readonly kind: JobCardKind;
  readonly progress: number | null;
  readonly headline: string;
  readonly detail: string | null;
  readonly elapsed: string | null;
  readonly remaining: string | null;
  readonly pageLabel: string | null;
}

function pageLabelOf(job: PrinterJob): string | null {
  if (job.pages === null) return null;
  const done = job.pagesDone ?? 0;
  return `Page ${String(Math.min(job.pages, done + 1))} of ${String(job.pages)}`;
}

function stoppedText(job: PrinterJob): string {
  const done = job.pagesDone;
  const total = job.pages;
  const at =
    done === null || total === null
      ? 'Stopped'
      : `Stopped at page ${String(done)} of ${String(total)}`;
  return `${at} · waiting for the printer`;
}

function offlineText(job: PrinterJob): string {
  const done = job.pagesDone;
  const total = job.pages;
  const at =
    done === null || total === null
      ? 'Last seen printing'
      : `Last seen at page ${String(done)} of ${String(total)}`;
  return `${at} · the printer is offline`;
}

function remainingOf(job: PrinterJob, ppm: number | null): string | null {
  if (ppm === null || ppm <= 0 || job.pages === null || job.pagesDone === null) return null;
  const left = Math.max(0, job.pages - job.pagesDone);
  return left === 0 ? null : `About ${clockLabel((left / ppm) * 60)} left`;
}

function elapsedOf(job: PrinterJob, now: number): string | null {
  if (job.startedAt === null) return null;
  return clockLabel(Math.max(0, (now - Date.parse(job.startedAt)) / 1000));
}

function haltedCard(job: PrinterJob, printer: PrinterHalt): JobCard | null {
  const progress = job.progress === null ? null : job.progress / 100;
  const quiet = { progress, elapsed: null, remaining: null, pageLabel: null };
  if (printer === 'offline') {
    return { kind: 'offline', headline: offlineText(job), detail: null, ...quiet };
  }
  if (printer === 'stopped' || job.state === 'stopped') {
    return {
      kind: 'stopped',
      headline: stoppedText(job),
      detail: job.cause ?? job.message,
      ...quiet,
    };
  }
  return null;
}

export function jobCardOf(
  job: PrinterJob,
  options: { readonly printer: PrinterHalt; readonly now: number; readonly ppm: number | null },
): JobCard {
  const halted = haltedCard(job, options.printer);
  if (halted !== null) return halted;
  const progress = job.progress === null ? null : job.progress / 100;
  if (job.state === 'held') {
    return {
      kind: 'held',
      progress: null,
      headline: 'On hold',
      detail: job.message,
      elapsed: null,
      remaining: null,
      pageLabel: null,
    };
  }
  if (job.state === 'pending') {
    const ahead = job.ahead ?? 0;
    const detail = ahead > 0 ? `${countLabel(ahead, 'job')} ahead` : 'Next in line';
    return {
      kind: 'waiting',
      progress: null,
      headline: 'Waiting',
      detail,
      elapsed: null,
      remaining: null,
      pageLabel: null,
    };
  }
  return {
    kind: 'printing',
    progress,
    headline: pageLabelOf(job) ?? 'Printing',
    detail: job.message,
    elapsed: elapsedOf(job, options.now),
    remaining: remainingOf(job, options.ppm),
    pageLabel: pageLabelOf(job),
  };
}
