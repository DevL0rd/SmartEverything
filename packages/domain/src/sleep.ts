import type { HealthRecord } from './health';
import { SLEEP_STAGE_KINDS, type SleepStageKind } from './health-codes';

type SleepSession = Extract<HealthRecord, { readonly type: 'SleepSession' }>;

const MINUTE_MS = 60_000;

const NOT_ASLEEP: ReadonlySet<SleepStageKind> = new Set(['awake', 'unknown']);

function minutesBetween(start: string, end: string): number {
  return (Date.parse(end) - Date.parse(start)) / MINUTE_MS;
}

export interface SleepSpan {
  readonly kind: SleepStageKind;
  readonly start: number;
  readonly end: number;
}

export function sleepSpansOf(session: SleepSession): SleepSpan[] {
  const sorted = session.data.stages
    .map((stage) => ({
      kind: SLEEP_STAGE_KINDS[stage.stage] ?? 'unknown',
      start: Date.parse(stage.startTime),
      end: Date.parse(stage.endTime),
    }))
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const spans: SleepSpan[] = [];
  let covered = Number.NEGATIVE_INFINITY;
  for (const span of sorted) {
    const start = Math.max(span.start, covered);
    if (span.end > start) {
      spans.push({ ...span, start });
      covered = span.end;
    }
  }
  return spans;
}

export function asleepMinutes(session: SleepSession): number {
  const spans = sleepSpansOf(session);
  if (spans.length === 0) {
    return minutesBetween(session.startTime, session.endTime);
  }
  return spans.reduce(
    (total, span) =>
      NOT_ASLEEP.has(span.kind) ? total : total + (span.end - span.start) / MINUTE_MS,
    0,
  );
}
