import type { ReactNode } from 'react';
import { BulkProgressLine } from '../components/bulk-progress';
import { Logger } from '@smarteverything/logging';
import { usePausable, ValueStore } from '../design/external-store';
import { errorFields } from '../design/log-tally';
import { rawErrorText } from '../format/errors';
import { count } from '../format/number';

const log = new Logger('app.bulk');

export const BULK_BATCH = 50;

export interface BulkProgress {
  readonly verb: string;
  readonly done: number;
  readonly total: number;
}

export interface BulkFailure {
  readonly itemId: string | null;
  readonly reason: string;
}

export interface BulkAnswer {
  readonly failed: readonly BulkFailure[];
}

export interface BulkJob {
  readonly label: string;
  readonly verb: string;
  readonly ids: readonly string[];
  readonly batch: number;
  readonly send: (batch: readonly string[]) => Promise<BulkAnswer>;
  readonly onBatch?: (landed: readonly string[]) => void;
}

export interface BulkOutcome {
  readonly landed: readonly string[];
  readonly kept: readonly string[];
  readonly reason: string | null;
}

const progress = new ValueStore<BulkProgress | null>(null);

export class BulkBusyError extends Error {
  override readonly name = 'BulkBusyError';

  constructor(readonly running: string) {
    super(`${running} is still running. Wait for it to finish.`);
  }
}

export function keptLine(outcome: BulkOutcome, reason: string): string {
  const total = outcome.landed.length + outcome.kept.length;
  return `${count(outcome.landed.length)} of ${count(total)} done. ${count(outcome.kept.length)} kept: ${reason}`;
}

export function bulkProgress(): BulkProgress | null {
  return progress.get();
}

export function useBulkProgress(): BulkProgress | null {
  return usePausable(progress.subscribe, progress.get);
}

export function useBulkRunning(): boolean {
  return useBulkProgress() !== null;
}

export function batchesOf(ids: readonly string[], size: number): readonly (readonly string[])[] {
  const batches: (readonly string[])[] = [];
  for (let start = 0; start < ids.length; start += size)
    batches.push(ids.slice(start, start + size));
  return batches;
}

function reasonOf(failed: readonly BulkFailure[]): string {
  const reasons = [...new Set(failed.map((failure) => failure.reason))];
  return reasons.join(' · ');
}

function landedOf(batch: readonly string[], failed: readonly BulkFailure[]): readonly string[] {
  if (failed.some((failure) => failure.itemId === null)) return [];
  const refused = new Set(failed.map((failure) => failure.itemId));
  return batch.filter((id) => !refused.has(id));
}

function keptOf(ids: readonly string[], landed: readonly string[]): readonly string[] {
  const done = new Set(landed);
  return ids.filter((id) => !done.has(id));
}

async function runBatches(job: BulkJob): Promise<BulkOutcome> {
  const landed: string[] = [];
  const refused: BulkFailure[] = [];
  const total = job.ids.length;
  let processed = 0;
  for (const batch of batchesOf(job.ids, job.batch)) {
    let answer: BulkAnswer;
    try {
      answer = await job.send(batch);
    } catch (error) {
      log.warn('bulk.batch_failed', { label: job.label, processed, total, ...errorFields(error) });
      return { landed, kept: keptOf(job.ids, landed), reason: rawErrorText(error) };
    }
    const moved = landedOf(batch, answer.failed);
    landed.push(...moved);
    refused.push(...answer.failed);
    processed += batch.length;
    progress.set({ verb: job.verb, done: processed, total });
    job.onBatch?.(moved);
  }
  if (refused.length === 0) return { landed, kept: [], reason: null };
  log.warn('bulk.items_refused', { label: job.label, landed: landed.length, total });
  return { landed, kept: keptOf(job.ids, landed), reason: reasonOf(refused) };
}

export async function runBulk(job: BulkJob): Promise<BulkOutcome> {
  if (job.ids.length === 0) throw new Error(`${job.label} was started with no items`);
  const running = progress.get();
  if (running !== null) {
    log.info('bulk.refused_while_running', { label: job.label, running: running.verb });
    throw new BulkBusyError(running.verb);
  }
  const begun = Date.now();
  progress.set({ verb: job.verb, done: 0, total: job.ids.length });
  try {
    const outcome = await runBatches(job);
    log.info('bulk.finished', {
      label: job.label,
      landed: outcome.landed.length,
      kept: outcome.kept.length,
      durationMs: Date.now() - begun,
    });
    return outcome;
  } finally {
    progress.set(null);
  }
}

export function BulkProgressShown({ onContainer }: { readonly onContainer: boolean }): ReactNode {
  const shown = useBulkProgress();
  if (shown === null) return null;
  return <BulkProgressLine {...shown} onContainer={onContainer} />;
}
