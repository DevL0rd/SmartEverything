import {
  VACUUM_SCOPES,
  VacuumValueError,
  type JsonValue,
  type VacuumClean,
  type VacuumScope,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { CleanOutcome } from './clean-session';

const ROLE = 'vacuum_cloud_records';
const EXPECTED = 'a JSON object with a label minutes_area_type_start_finish and a start time';
const RECORD = z.looseObject({ label: z.string(), stime: z.number().int().nonnegative() });
const LABEL = /^(\d+)_(\d+)_(\d+)(?:_(\d+))?(?:_(\d+))?$/u;
const THOUSANDTHS_PER_M2 = 1000;
const MILLISECONDS = 1000;

const FINISH_OUTCOMES: ReadonlyMap<number, CleanOutcome> = new Map([
  [0, 'finished'],
  [1, 'stopped'],
  [2, 'error'],
  [3, 'stopped'],
]);

export interface CloudRecord {
  readonly startedAtMs: number;
  readonly areaM2: number;
  readonly scope: VacuumScope | null;
  readonly outcome: CleanOutcome | null;
}

function parsedRecord(text: string): z.infer<typeof RECORD> {
  let decoded: unknown;
  try {
    decoded = JSON.parse(text);
  } catch (cause) {
    throw new VacuumValueError(ROLE, EXPECTED, 'text that is not JSON', { cause });
  }
  const parsed = RECORD.safeParse(decoded);
  if (!parsed.success) throw new VacuumValueError(ROLE, EXPECTED, 'JSON without a label');
  return parsed.data;
}

function outcomeOf(finish: string | undefined, label: string): CleanOutcome | null {
  if (finish === undefined) return null;
  const outcome = FINISH_OUTCOMES.get(Number(finish));
  if (outcome === undefined) throw new VacuumValueError(ROLE, 'a finish code 0 to 3', label);
  return outcome;
}

export function cloudRecordOf(value: JsonValue | undefined): CloudRecord | null {
  if (value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new VacuumValueError(ROLE, EXPECTED, typeof value);
  const record = parsedRecord(value);
  const parts = LABEL.exec(record.label);
  if (parts === null) throw new VacuumValueError(ROLE, EXPECTED, record.label);
  const [, , area, type, , finish] = parts;
  return {
    startedAtMs: record.stime * MILLISECONDS,
    areaM2: Number(area) / THOUSANDTHS_PER_M2,
    scope: VACUUM_SCOPES.find((row) => row.value === Number(type))?.scope ?? null,
    outcome: outcomeOf(finish, record.label),
  };
}

export function isRecordOf(record: CloudRecord, clean: VacuumClean): boolean {
  return clean.endedAt !== null && record.startedAtMs <= Date.parse(clean.endedAt);
}

export function recordedOf(clean: VacuumClean, record: CloudRecord): VacuumClean {
  return {
    ...clean,
    areaM2: record.areaM2,
    scope: record.scope ?? clean.scope,
    outcome: record.outcome ?? clean.outcome,
  };
}
