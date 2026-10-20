import {
  SLEEP_STAGE_KINDS,
  asleepMinutes,
  type HealthRecord,
  type SleepStageKind,
} from '@smarteverything/domain';
import { HOUR_MS } from '../../format/time';
import type { HypnogramSegment, HypnogramStage } from '../../components/charts';

export interface LastNight {
  readonly segments: readonly HypnogramSegment[];
  readonly asleepMinutes: number;
  readonly bedtime: number;
  readonly wake: number;
}

export const NIGHT_WINDOW_MS = 36 * HOUR_MS;

const STAGE: Readonly<Record<SleepStageKind, HypnogramStage | null>> = {
  awake: 'awake',
  rem: 'rem',
  light: 'light',
  deep: 'deep',
  asleep: 'asleep',
  unknown: null,
};

function segmentsOf(record: Extract<HealthRecord, { type: 'SleepSession' }>): HypnogramSegment[] {
  const staged = record.data.stages
    .flatMap((span) => {
      const stage = STAGE[SLEEP_STAGE_KINDS[span.stage] ?? 'unknown'];
      const start = Date.parse(span.startTime);
      const end = Date.parse(span.endTime);
      return stage === null || end <= start ? [] : [{ start, end, stage }];
    })
    .sort((left, right) => left.start - right.start);
  if (staged.length > 0) {
    return staged;
  }
  return [
    {
      start: Date.parse(record.startTime),
      end: Date.parse(record.endTime),
      stage: 'asleep',
    },
  ];
}

export function lastNightOf(records: readonly HealthRecord[], now: number): LastNight | null {
  let best: LastNight | null = null;
  for (const record of records) {
    if (record.type !== 'SleepSession') {
      continue;
    }
    const wake = Date.parse(record.endTime);
    if (now - wake > NIGHT_WINDOW_MS || wake > now) {
      continue;
    }
    if (best === null || wake > best.wake) {
      best = {
        segments: segmentsOf(record),
        asleepMinutes: asleepMinutes(record),
        bedtime: Date.parse(record.startTime),
        wake,
      };
    }
  }
  return best;
}
