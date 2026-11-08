import {
  vacuumJob,
  type DeviceEvent,
  type VacuumClean,
  type VacuumValues,
} from '@smarteverything/domain';
import { VACUUM_EVENT_FAMILY } from '@smarteverything/xiaomi';
import { areaM2Of, factsOf, secondsOf, zonesOf, type CleanOutcome } from './clean-session';
import { cleanFactsOf, cleanStartOccurrence, cycleFinishedWithFacts } from './events';

const MILLISECONDS = 1000;

function batteryOf(values: VacuumValues): number | null {
  const level = values.battery;
  return typeof level === 'number' && level >= 0 && level <= 100 ? level : null;
}

function reported(values: VacuumValues): { seconds: number | null; areaM2: number | null } {
  const seconds = secondsOf(values.vacuum_seconds);
  const area = areaM2Of(values.vacuum_area);
  return {
    seconds: seconds !== null && seconds > 0 ? seconds : null,
    areaM2: area !== null && area > 0 ? area : null,
  };
}

export function draftOf(
  values: VacuumValues,
  names: ReadonlyMap<number, string>,
  identity: { readonly id: string; readonly startedAt: string },
): VacuumClean {
  const facts = cleanFactsOf(values, names, { id: identity.id, areaM2: null });
  return {
    ...identity,
    endedAt: null,
    seconds: 0,
    areaM2: 0,
    scope: facts.scope,
    mode: facts.mode,
    rooms: facts.rooms.map(({ id, name }) => ({ id, name })),
    outcome: null,
    batteryStart: batteryOf(values),
    batteryEnd: null,
    mapIndex: null,
    zones: zonesOf(vacuumJob(values)),
    trail: [],
  };
}

export function refreshedOf(
  clean: VacuumClean,
  values: VacuumValues,
  names: ReadonlyMap<number, string>,
): VacuumClean {
  const facts = cleanFactsOf(values, names, { id: clean.id, areaM2: null });
  return {
    ...resultsOf(clean, values),
    scope: facts.scope,
    mode: facts.mode,
    rooms: facts.rooms.map(({ id, name }) => ({ id, name })),
    zones: zonesOf(vacuumJob(values)),
  };
}

export function resultsOf(clean: VacuumClean, values: VacuumValues): VacuumClean {
  const results = reported(values);
  return {
    ...clean,
    seconds: results.seconds ?? clean.seconds,
    areaM2: results.areaM2 ?? clean.areaM2,
  };
}

export function closedOf(
  clean: VacuumClean,
  values: VacuumValues,
  ending: { readonly endedAt: string; readonly outcome: CleanOutcome | null },
): VacuumClean {
  const results = reported(values);
  const elapsed = Math.round(
    (Date.parse(ending.endedAt) - Date.parse(clean.startedAt)) / MILLISECONDS,
  );
  return {
    ...clean,
    endedAt: ending.endedAt,
    outcome: ending.outcome,
    seconds: results.seconds ?? Math.max(clean.seconds, elapsed),
    areaM2: results.areaM2 ?? clean.areaM2,
    batteryEnd: batteryOf(values),
  };
}

function withoutReport(details: DeviceEvent['details']): DeviceEvent['details'] {
  return Object.fromEntries(Object.entries(details).filter(([name]) => name !== 'miotEvent'));
}

export function finishedEventOf(
  externalId: string,
  clean: VacuumClean,
  outcome: CleanOutcome,
  sweepComplete: DeviceEvent | null,
): DeviceEvent {
  const base: DeviceEvent =
    sweepComplete === null
      ? {
          externalId,
          kind: 'cycle_finished',
          occurredAt: clean.endedAt ?? clean.startedAt,
          details: { family: VACUUM_EVENT_FAMILY, source: 'state', outcome },
        }
      : { ...sweepComplete, details: { ...withoutReport(sweepComplete.details), outcome } };
  return cycleFinishedWithFacts(base, factsOf(clean));
}

export const CLEAN_STARTED_NAME = 'clean_started';

export function startedEventOf(externalId: string, clean: VacuumClean): DeviceEvent {
  return {
    externalId,
    kind: 'activity',
    occurredAt: clean.startedAt,
    occurrence: cleanStartOccurrence(externalId, clean.id),
    details: {
      family: VACUUM_EVENT_FAMILY,
      source: 'state',
      name: CLEAN_STARTED_NAME,
      summary: 'Cleaning started',
      cleanId: clean.id,
      scope: clean.scope,
      mode: clean.mode,
      rooms: clean.rooms.map((room) => ({ id: room.id, name: room.name })),
    },
  };
}
