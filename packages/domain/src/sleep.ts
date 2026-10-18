import type { HealthRecord } from './health';
import { SLEEP_STAGE_KINDS, type SleepStageKind } from './health-codes';

type SleepSession = Extract<HealthRecord, { readonly type: 'SleepSession' }>;

const MINUTE_MS = 60_000;

const NOT_ASLEEP: ReadonlySet<SleepStageKind> = new Set(['awake', 'unknown']);

function minutesBetween(start: string, end: string): number {
  return (Date.parse(end) - Date.parse(start)) / MINUTE_MS;
}

export function asleepMinutes(session: SleepSession): number {
  const spans = session.data.stages
    .map((stage) => ({
      kind: SLEEP_STAGE_KINDS[stage.stage] ?? 'unknown',
      minutes: minutesBetween(stage.startTime, stage.endTime),
    }))
    .filter((span) => span.minutes > 0);
  if (spans.length === 0) {
    return minutesBetween(session.startTime, session.endTime);
  }
  return spans.reduce(
    (total, span) => (NOT_ASLEEP.has(span.kind) ? total : total + span.minutes),
    0,
  );
}
