import {
  VACUUM_STATUS_TABLE,
  type VACUUM_OUTCOMES,
  VacuumValueError,
  vacuumPhase,
  type DeviceEvent,
  type JsonValue,
  type VacuumClean,
  type VacuumJob,
  type VacuumPhase,
  type VacuumPoint,
} from '@smarteverything/domain';
import { VACUUM_EVENT_FAMILY } from '@smarteverything/xiaomi';
import type { CleanFacts } from './events';

export type CleanOutcome = (typeof VACUUM_OUTCOMES)[number];

const ACTIVE_PHASES: ReadonlySet<VacuumPhase> = new Set([
  'cleaning',
  'mopping',
  'paused',
  'returning',
  'washing_mop',
]);

const STARTING_PHASES: ReadonlySet<VacuumPhase> = new Set(['cleaning', 'mopping']);

const BREAK_CHARGING = 3;
const GO_CHARGING = 6;
const RECHARGE_RETURNS: ReadonlySet<number> = new Set([13, 19]);
const MILLIMETRES_PER_METRE = 1000;
const HUNDREDTHS_PER_M2 = 100;
const SWEEP_COMPLETE = 'sweep-complete';

export function phaseOf(status: JsonValue | undefined): VacuumPhase | null {
  return vacuumPhase(status === undefined ? {} : { vacuum_status: status });
}

export function statusNumberOf(status: JsonValue | undefined): number | null {
  if (typeof status === 'number') return status;
  const entry = VACUUM_STATUS_TABLE.find((row) => row.spec === status);
  return entry?.value ?? null;
}

export function isSessionPhase(phase: VacuumPhase | null): boolean {
  return phase === 'station_busy' || (phase !== null && ACTIVE_PHASES.has(phase));
}

export function isResumablePhase(phase: VacuumPhase | null): boolean {
  return phase !== null && ACTIVE_PHASES.has(phase);
}

export function startsClean(previous: VacuumPhase | null, phase: VacuumPhase | null): boolean {
  return (
    previous !== null &&
    phase !== null &&
    STARTING_PHASES.has(phase) &&
    !ACTIVE_PHASES.has(previous)
  );
}

export function keepsSession(status: JsonValue | undefined): boolean {
  return statusNumberOf(status) === BREAK_CHARGING;
}

export type Ending =
  | { readonly outcome: CleanOutcome }
  | { readonly outcome: null; readonly awaiting: 'sweep-complete' };

export function endingOf(previous: JsonValue | undefined, phase: VacuumPhase | null): Ending {
  const was = statusNumberOf(previous);
  if (phase === 'error') return { outcome: 'error' };
  if (was === BREAK_CHARGING || (was !== null && RECHARGE_RETURNS.has(was))) {
    return { outcome: 'returned_low_battery' };
  }
  return was === GO_CHARGING ? { outcome: null, awaiting: SWEEP_COMPLETE } : { outcome: 'stopped' };
}

export function zonesOf(job: VacuumJob | null): VacuumPoint[][] {
  return (job?.zones ?? []).map((zone) => {
    if (zone.length % 2 !== 0) {
      throw new VacuumValueError('vacuum_job', 'zones as x and y pairs', zone);
    }
    return Array.from({ length: zone.length / 2 }, (_, pair) => ({
      x: (zone[pair * 2] ?? 0) / MILLIMETRES_PER_METRE,
      y: (zone[pair * 2 + 1] ?? 0) / MILLIMETRES_PER_METRE,
    }));
  });
}

export function areaM2Of(raw: JsonValue | undefined): number | null {
  return typeof raw === 'number' && raw >= 0 ? raw / HUNDREDTHS_PER_M2 : null;
}

export function secondsOf(raw: JsonValue | undefined): number | null {
  return typeof raw === 'number' && raw >= 0 ? Math.round(raw) : null;
}

export function taskKey(taskId: number): string {
  return `task-${String(taskId)}`;
}

export function startKey(startedAt: string): string {
  return `start-${startedAt}`;
}

export function isSweepComplete(event: DeviceEvent): boolean {
  return (
    event.kind === 'cycle_finished' &&
    event.details['family'] === VACUUM_EVENT_FAMILY &&
    event.details['miotEvent'] === SWEEP_COMPLETE
  );
}

export function factsOf(clean: VacuumClean): CleanFacts {
  return {
    id: clean.id,
    areaM2: clean.areaM2,
    areaRaw: Math.round(clean.areaM2 * HUNDREDTHS_PER_M2),
    seconds: clean.seconds,
    scope: clean.scope,
    mode: clean.mode,
    rooms: clean.rooms,
  };
}

export function sameJob(
  clean: VacuumClean,
  scope: string | null,
  mode: string | null,
  job: VacuumJob | null,
): boolean {
  const rooms = new Set(clean.rooms.map((room) => room.id));
  const wanted = job?.rooms ?? [];
  return (
    clean.scope === scope &&
    clean.mode === mode &&
    rooms.size === wanted.length &&
    wanted.every((id) => rooms.has(id))
  );
}
