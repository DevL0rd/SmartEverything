import {
  LAUNDRY_EVENT_FAMILY,
  laundryProgramById,
  laundryProgramByRaw,
  type DeviceEvent,
  type EventKind,
  type JsonValue,
  type LaundryProgram,
} from '@smarteverything/domain';
import { z } from 'zod';

export type CycleOutcome = 'completed' | 'stopped';

export interface HistoryRow {
  readonly kind: EventKind;
  readonly occurredAt: string;
  readonly details: Readonly<Record<string, JsonValue>>;
}

export interface OpenCycle {
  readonly startedAt: string;
  readonly program: string;
  readonly programId: number | null;
  readonly plannedMinutes: number | null;
}

export interface ProgramFacts {
  readonly program: string;
  readonly programId: number | null;
  readonly dries: boolean;
}

const STARTED = 'started';

const START_DETAILS = z.object({
  startedAt: z.iso.datetime({ offset: true }),
  program: z.string(),
  programId: z.number().nullable(),
  plannedMinutes: z.number().nullable(),
});

const MILLISECONDS_PER_MINUTE = 60_000;
const LONGEST_CYCLE_MINUTES = 1440;

export function programFacts(raw: JsonValue | undefined): ProgramFacts {
  const known: LaundryProgram | undefined =
    typeof raw === 'string' ? laundryProgramByRaw(raw) : undefined;
  if (known !== undefined) {
    return { program: known.label, programId: known.id, dries: known.dries };
  }
  return {
    program: typeof raw === 'string' ? raw : 'Unknown program',
    programId: null,
    dries: false,
  };
}

export function startOccurrence(deviceId: string, startedAt: string): string {
  return `laundry:${deviceId}:${startedAt}:start`;
}

export function endOccurrence(deviceId: string, anchor: string): string {
  return `laundry:${deviceId}:${anchor}:end`;
}

export function startDetails(
  startedAt: string,
  facts: ProgramFacts,
  plannedMinutes: number | null,
  options: Readonly<Record<string, JsonValue>>,
): Record<string, JsonValue> {
  return {
    family: LAUNDRY_EVENT_FAMILY,
    laundry: STARTED,
    source: 'state',
    startedAt,
    program: facts.program,
    programId: facts.programId,
    plannedMinutes,
    options,
  };
}

export interface Finish {
  readonly open: OpenCycle | null;
  readonly fallback: ProgramFacts;
  readonly outcome: CycleOutcome;
  readonly finishedAt: string;
  readonly source: string;
}

export function finishDetails(finish: Finish): Record<string, JsonValue> {
  const { open, fallback, outcome, finishedAt, source } = finish;
  const facts = open === null ? fallback : factsOf(open);
  const measured = open === null ? null : measuredMinutes(open.startedAt, finishedAt);
  return {
    family: LAUNDRY_EVENT_FAMILY,
    source,
    outcome,
    program: facts.program,
    startedAt: measured === null ? null : (open?.startedAt ?? null),
    minutes: measured,
    dried: facts.dries,
    energy: null,
    water: null,
  };
}

function measuredMinutes(startedAt: string, finishedAt: string): number | null {
  const minutes = Math.round(
    (Date.parse(finishedAt) - Date.parse(startedAt)) / MILLISECONDS_PER_MINUTE,
  );
  return minutes > LONGEST_CYCLE_MINUTES ? null : minutes;
}

function factsOf(open: OpenCycle): ProgramFacts {
  const known = open.programId === null ? undefined : laundryProgramById(open.programId);
  return { program: open.program, programId: open.programId, dries: known?.dries === true };
}

export function openCycleOf(rows: readonly HistoryRow[]): OpenCycle | null {
  for (const row of rows) {
    if (row.kind === 'cycle_finished' && row.details['family'] === LAUNDRY_EVENT_FAMILY) {
      return null;
    }
    if (row.kind === 'activity' && row.details['laundry'] === STARTED) {
      return START_DETAILS.parse(row.details);
    }
  }
  return null;
}

export function isDeviceReportedEnd(event: DeviceEvent): boolean {
  return (
    event.kind === 'cycle_finished' &&
    event.details['family'] === LAUNDRY_EVENT_FAMILY &&
    typeof event.details['miotEvent'] === 'string'
  );
}
