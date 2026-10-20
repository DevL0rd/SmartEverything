import {
  recordWallTime,
  type OralbHeaderRecord,
  type OralbSessionRecord,
} from '@smarteverything/ble';
import { isComplete, oralbModeOf, type BrushMode } from '@smarteverything/domain';
import type { RetainedDraft } from '../toothbrush/brand';
import type { ObservedRun } from './state';

const MERGE_WINDOW_MS = 120_000;

const DEFAULT_ROUTINE_SECONDS = 120;

interface RecordClock {
  readonly clock: number | null;
  readonly clockAtMs: number | null;
}

function startedAt(startClock: number, clock: RecordClock): string | null {
  if (clock.clock === null || clock.clockAtMs === null) {
    return null;
  }
  return new Date(recordWallTime(startClock, clock.clock, clock.clockAtMs)).toISOString();
}

function routineOf(targetS: number): number {
  return targetS > 0 ? targetS : DEFAULT_ROUTINE_SECONDS;
}

export function sessionDraft(record: OralbSessionRecord, clock: RecordClock): RetainedDraft | null {
  const start = startedAt(record.startClock, clock);
  if (start === null) {
    return null;
  }
  const routineS = routineOf(record.targetS);
  const excessS = record.highPressureMs / 1000;
  const lowS = record.lowPressureMs / 1000;
  return {
    handleSessionId: record.sessionId,
    startedAt: start,
    durationS: record.durationS,
    routineS,
    mode: oralbModeOf(record.modeId),
    intensity: null,
    complete: isComplete(record.durationS, routineS),
    zones: null,
    details: {
      zoneSource: 'pacer',
      face: null,
      batteryEnd: record.batteryEnd,
      handleUser: record.userId,
      sectors: record.sectorCount === 0 ? null : record.sectorCount,
    },
    pressure: {
      excessS,
      lowS,
      optimalS: Math.max(0, record.durationS - excessS - lowS),
      highEvents: record.highPressureEvents,
      lowEvents: record.lowPressureEvents,
      forceAvgN: record.averageForceMn / 1000,
      forceMaxN: record.maximumForceMn / 1000,
    },
    headSerial: null,
  };
}

export function runNear(
  header: OralbHeaderRecord,
  clock: RecordClock,
  runs: readonly ObservedRun[],
): { readonly run: ObservedRun; readonly start: string } | null {
  const start = startedAt(header.startClock, clock);
  if (start === null) {
    return null;
  }
  const startMs = Date.parse(start);
  const run = runs.find(
    (candidate) => Math.abs(candidate.startedAtMs - startMs) <= MERGE_WINDOW_MS,
  );
  return run === undefined ? null : { run, start };
}

export function headerDraft(
  header: OralbHeaderRecord,
  match: { readonly run: ObservedRun; readonly start: string },
): RetainedDraft {
  const routineS = routineOf(header.targetS);
  const mode: BrushMode | null = match.run.mode;
  return {
    handleSessionId: header.sessionId,
    startedAt: match.start,
    durationS: match.run.durationS,
    routineS,
    mode,
    intensity: null,
    complete: isComplete(match.run.durationS, routineS),
    zones: null,
    details: {
      zoneSource: 'pacer',
      face: null,
      batteryEnd: null,
      handleUser: header.userId,
      sectors: header.sectorCount === 0 ? null : header.sectorCount,
    },
    pressure: null,
    headSerial: null,
  };
}

export function missedStart(header: OralbHeaderRecord, clock: RecordClock): string | null {
  return startedAt(header.startClock, clock);
}
