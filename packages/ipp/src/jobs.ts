import { z } from 'zod';
import { JOB_STATE } from './ops';
import type { PlainObject } from './plain';
import { maybeSet, orNull, present, textOrNull, trySource, type DropReporter } from './schema-kit';

export type JobStateName =
  'pending' | 'held' | 'processing' | 'stopped' | 'canceled' | 'aborted' | 'completed';

export interface PrinterJob {
  readonly id: number;
  readonly uuid: string | null;
  readonly name: string | null;
  readonly user: string | null;
  readonly state: JobStateName;
  readonly reasons: readonly string[];
  readonly printerReasons: readonly string[];
  readonly message: string | null;
  readonly createdAt: number | null;
  readonly startedAt: number | null;
  readonly completedAt: number | null;
  readonly createdDate: string | null;
  readonly startedDate: string | null;
  readonly completedDate: string | null;
  readonly impressions: number | null;
  readonly impressionsDone: number | null;
  readonly sheets: number | null;
  readonly sheetsDone: number | null;
  readonly progress: number | null;
  readonly kOctets: number | null;
  readonly copies: number | null;
  readonly format: string | null;
  readonly ahead: number | null;
  readonly printerUpTime: number | null;
  readonly color: number | null;
  readonly mono: number | null;
}

const JOB_STATES: ReadonlyMap<number, JobStateName> = new Map([
  [JOB_STATE.pending, 'pending'],
  [JOB_STATE.pendingHeld, 'held'],
  [JOB_STATE.processing, 'processing'],
  [JOB_STATE.processingStopped, 'stopped'],
  [JOB_STATE.canceled, 'canceled'],
  [JOB_STATE.aborted, 'aborted'],
  [JOB_STATE.completed, 'completed'],
]);

const IMPRESSIONS_COL = z.object({
  monochrome: orNull(z.number()),
  'full-color': orNull(z.number()),
});

const JOB_SOURCE = z.object({
  'job-id': z.number(),
  'job-state': z.number(),
  'job-uuid': textOrNull(),
  'job-name': textOrNull(),
  'job-originating-user-name': textOrNull(),
  'job-state-reasons': maybeSet(z.string()),
  'job-printer-state-reasons': maybeSet(z.string()),
  'job-state-message': textOrNull(),
  'time-at-creation': orNull(z.number()),
  'time-at-processing': orNull(z.number()),
  'time-at-completed': orNull(z.number()),
  'date-time-at-creation': textOrNull(),
  'date-time-at-processing': textOrNull(),
  'date-time-at-completed': textOrNull(),
  'job-impressions': orNull(z.number()),
  'job-impressions-completed': orNull(z.number()),
  'job-media-sheets': orNull(z.number()),
  'job-media-sheets-completed': orNull(z.number()),
  'job-media-progress': orNull(z.number()),
  'job-k-octets': orNull(z.number()),
  copies: orNull(z.number()),
  'document-format-supplied': textOrNull(),
  'number-of-intervening-jobs': orNull(z.number()),
  'job-printer-up-time': orNull(z.number()),
  'job-impressions-completed-col': orNull(IMPRESSIONS_COL),
});

export const JOB_ATTRIBUTES: readonly string[] = [
  'job-id',
  'job-uuid',
  'job-name',
  'job-originating-user-name',
  'job-state',
  'job-state-reasons',
  'job-printer-state-reasons',
  'job-state-message',
  'time-at-creation',
  'time-at-processing',
  'time-at-completed',
  'date-time-at-creation',
  'date-time-at-processing',
  'date-time-at-completed',
  'job-impressions',
  'job-impressions-completed',
  'job-media-sheets',
  'job-media-sheets-completed',
  'job-media-progress',
  'job-k-octets',
  'copies',
  'document-format-supplied',
  'number-of-intervening-jobs',
  'job-printer-up-time',
  'job-impressions-completed-col',
];

export function readJob(plain: PlainObject, report?: DropReporter): PrinterJob | null {
  const parsed = trySource(JOB_SOURCE, present(plain), report);
  if (!parsed.success) return null;
  const source = parsed.data;
  const state = JOB_STATES.get(source['job-state']);
  if (state === undefined) {
    report?.dropped('job-state', `record skipped: unknown job state ${String(source['job-state'])}`);
    return null;
  }
  const col = source['job-impressions-completed-col'];
  return {
    id: source['job-id'],
    uuid: source['job-uuid']?.replace(/^urn:uuid:/iu, '') ?? null,
    name: source['job-name'],
    user: source['job-originating-user-name'],
    state,
    reasons: source['job-state-reasons'].filter((reason) => reason !== 'none'),
    printerReasons: source['job-printer-state-reasons'].filter((reason) => reason !== 'none'),
    message: source['job-state-message'],
    createdAt: source['time-at-creation'],
    startedAt: source['time-at-processing'],
    completedAt: source['time-at-completed'],
    createdDate: source['date-time-at-creation'],
    startedDate: source['date-time-at-processing'],
    completedDate: source['date-time-at-completed'],
    impressions: source['job-impressions'],
    impressionsDone: source['job-impressions-completed'],
    sheets: source['job-media-sheets'],
    sheetsDone: source['job-media-sheets-completed'],
    progress: source['job-media-progress'],
    kOctets: source['job-k-octets'],
    copies: source.copies,
    format: source['document-format-supplied'],
    ahead: source['number-of-intervening-jobs'],
    printerUpTime: source['job-printer-up-time'],
    color: col?.['full-color'] ?? null,
    mono: col?.monochrome ?? null,
  };
}

export function readJobs(
  groups: readonly PlainObject[],
  report?: DropReporter,
): readonly PrinterJob[] {
  return groups.flatMap((group) => {
    const job = readJob(group, report);
    return job === null ? [] : [job];
  });
}
