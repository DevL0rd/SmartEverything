import { LAUNDRY_EVENT_FAMILY, type EventRow, type JsonValue } from '@smarteverything/domain';
import { compareText } from '../../../format/text';

type CycleOutcome = 'completed' | 'stopped';

export interface Cycle {
  readonly id: string;
  readonly program: string;
  readonly startedAt: string | null;
  readonly finishedAt: string;
  readonly minutes: number | null;
  readonly energy: number | null;
  readonly water: number | null;
  readonly outcome: CycleOutcome;
}

export interface CycleView {
  readonly cycles: readonly Cycle[];
  readonly plannedMinutes: number | null;
}

function numberOf(value: JsonValue | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function cycleOf(row: EventRow): Cycle | null {
  const { details } = row;
  if (row.kind !== 'cycle_finished' || details['family'] !== LAUNDRY_EVENT_FAMILY) {
    return null;
  }
  const program = details['program'];
  const started = details['startedAt'];
  return {
    id: row.id,
    program: typeof program === 'string' ? program : 'Unknown program',
    startedAt: typeof started === 'string' ? started : null,
    finishedAt: row.occurred_at,
    minutes: numberOf(details['minutes']),
    energy: numberOf(details['energy']),
    water: numberOf(details['water']),
    outcome: details['outcome'] === 'stopped' ? 'stopped' : 'completed',
  };
}

function plannedOf(rows: readonly EventRow[]): number | null {
  for (const row of rows) {
    if (row.kind === 'cycle_finished' && row.details['family'] === LAUNDRY_EVENT_FAMILY) {
      return null;
    }
    if (row.kind === 'activity' && row.details['laundry'] === 'started') {
      return numberOf(row.details['plannedMinutes']);
    }
  }
  return null;
}

export function cycleViewOf(rows: readonly EventRow[]): CycleView {
  const newestFirst = [...rows].sort((a, b) => compareText(b.occurred_at, a.occurred_at));
  return {
    cycles: newestFirst.flatMap((row) => cycleOf(row) ?? []),
    plannedMinutes: plannedOf(newestFirst),
  };
}

export function progressOf(remaining: number | null, planned: number | null): number | null {
  if (remaining === null || planned === null || planned <= 0) {
    return null;
  }
  return Math.min(1, Math.max(0, 1 - remaining / planned));
}
