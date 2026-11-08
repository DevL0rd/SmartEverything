import {
  API_ENDPOINTS as E,
  type PlannerAlarmRow,
  type PlannerCollectionRow,
  type PlannerDay,
  type PlannerFreeSlot,
  type PlannerItemRow,
  type PlannerOccurrenceRow,
  type PlannerPreferences,
  type PlannerRange,
  type PlannerRingRow,
  type PlannerStats,
  type PlannerStatsRange,
  type PlannerStopwatchRow,
  type PlannerTimerRow,
} from '@smarteverything/domain';
import type { z } from 'zod';
import { api } from './transport';

type Body<K extends keyof typeof E> = z.input<(typeof E)[K]['body']>;

export type PlannerParse = z.output<(typeof E)['parsePlannerText']['response']>;

export type PlannerSuggestion = z.output<
  (typeof E)['suggestPlannerCompletion']['response']
>[number];

type PersonId = string | undefined;

function person(personId: PersonId): { readonly personId?: string } {
  return personId === undefined ? {} : { personId };
}

export async function readPlannerDay(personId: PersonId, date: string): Promise<PlannerDay> {
  return api().call(E.readPlannerDay, { query: { ...person(personId), date } });
}

export async function readPlannerRange(
  personId: PersonId,
  from: string,
  to: string,
  collections: readonly string[] | undefined,
): Promise<PlannerRange> {
  return api().call(E.readPlannerRange, {
    query: {
      ...person(personId),
      from,
      to,
      ...(collections === undefined ? {} : { collections: [...collections] }),
    },
  });
}

export async function readPlannerStats(
  personId: PersonId,
  range: PlannerStatsRange,
): Promise<PlannerStats> {
  return api().call(E.readPlannerStats, { query: { ...person(personId), range } });
}

export async function readPlannerRings(
  personId: PersonId,
  from: string,
  to: string,
): Promise<PlannerRingRow[]> {
  return api().call(E.listPlannerRings, { query: { ...person(personId), from, to } });
}

export async function readPlannerPreferences(personId: PersonId): Promise<PlannerPreferences> {
  return api().call(E.readPlannerPreferences, { query: person(personId) });
}

export async function writePlannerPreferences(
  personId: PersonId,
  preferences: PlannerPreferences,
): Promise<PlannerPreferences> {
  return api().call(E.writePlannerPreferences, { query: person(personId), body: preferences });
}

export async function createPlannerCollection(
  personId: PersonId,
  body: Body<'createPlannerCollection'>,
): Promise<PlannerCollectionRow> {
  return api().call(E.createPlannerCollection, { query: person(personId), body });
}

export async function updatePlannerCollection(
  personId: PersonId,
  collectionId: string,
  body: Body<'updatePlannerCollection'>,
): Promise<PlannerCollectionRow> {
  return api().call(E.updatePlannerCollection, {
    params: { collectionId },
    query: person(personId),
    body,
  });
}

export async function deletePlannerCollection(
  personId: PersonId,
  collectionId: string,
): Promise<void> {
  await api().call(E.deletePlannerCollection, {
    params: { collectionId },
    query: person(personId),
  });
}

export async function createPlannerItem(
  personId: PersonId,
  body: Body<'createPlannerItem'>,
): Promise<PlannerItemRow> {
  return api().call(E.createPlannerItem, { query: person(personId), body });
}

export async function updatePlannerItem(
  personId: PersonId,
  itemId: string,
  body: Body<'updatePlannerItem'>,
): Promise<PlannerItemRow> {
  return api().call(E.updatePlannerItem, { params: { itemId }, query: person(personId), body });
}

export interface PlannerDeleteScope {
  readonly scope?: 'this' | 'following' | 'all';
  readonly occurrenceKey?: string;
}

export async function deletePlannerItem(
  personId: PersonId,
  itemId: string,
  { scope, occurrenceKey }: PlannerDeleteScope = {},
): Promise<void> {
  await api().call(E.deletePlannerItem, {
    params: { itemId },
    query: {
      ...person(personId),
      ...(scope === undefined ? {} : { scope }),
      ...(occurrenceKey === undefined ? {} : { occurrence_key: occurrenceKey }),
    },
  });
}

export async function completePlannerItem(
  personId: PersonId,
  itemId: string,
  body: Body<'completePlannerItem'>,
): Promise<PlannerOccurrenceRow> {
  return api().call(E.completePlannerItem, { params: { itemId }, query: person(personId), body });
}

export async function skipPlannerItem(
  personId: PersonId,
  itemId: string,
  occurrenceKey: string,
): Promise<PlannerOccurrenceRow> {
  return api().call(E.skipPlannerItem, {
    params: { itemId },
    query: person(personId),
    body: { occurrence_key: occurrenceKey },
  });
}

export async function movePlannerItem(
  personId: PersonId,
  itemId: string,
  body: Body<'movePlannerItem'>,
): Promise<PlannerOccurrenceRow> {
  return api().call(E.movePlannerItem, { params: { itemId }, query: person(personId), body });
}

export async function parsePlannerText(
  personId: PersonId,
  body: Body<'parsePlannerText'>,
): Promise<PlannerParse> {
  return api().call(E.parsePlannerText, { query: person(personId), body });
}

export async function suggestPlannerCompletion(
  personId: PersonId,
  body: Body<'suggestPlannerCompletion'>,
): Promise<PlannerSuggestion[]> {
  return api().call(E.suggestPlannerCompletion, { query: person(personId), body });
}

export async function readPlannerFreeSlots(
  personId: PersonId,
  body: Body<'plannerFreeSlots'>,
): Promise<PlannerFreeSlot[]> {
  return api().call(E.plannerFreeSlots, { query: person(personId), body });
}

export async function acceptPlannerProposal(
  personId: PersonId,
  id: string,
): Promise<PlannerItemRow> {
  return api().call(E.acceptPlannerProposal, { params: { id }, query: person(personId) });
}

export async function rejectPlannerProposal(personId: PersonId, id: string): Promise<void> {
  await api().call(E.rejectPlannerProposal, { params: { id }, query: person(personId) });
}

export async function createPlannerAlarm(
  personId: PersonId,
  body: Body<'createPlannerAlarm'>,
): Promise<PlannerAlarmRow> {
  return api().call(E.createPlannerAlarm, { query: person(personId), body });
}

export async function updatePlannerAlarm(
  personId: PersonId,
  alarmId: string,
  body: Body<'updatePlannerAlarm'>,
): Promise<PlannerAlarmRow> {
  return api().call(E.updatePlannerAlarm, { params: { alarmId }, query: person(personId), body });
}

export async function deletePlannerAlarm(personId: PersonId, alarmId: string): Promise<void> {
  await api().call(E.deletePlannerAlarm, { params: { alarmId }, query: person(personId) });
}

export async function snoozePlannerAlarm(
  personId: PersonId,
  alarmId: string,
  body: Body<'snoozePlannerAlarm'>,
): Promise<PlannerRingRow> {
  return api().call(E.snoozePlannerAlarm, { params: { alarmId }, query: person(personId), body });
}

export async function dismissPlannerAlarm(
  personId: PersonId,
  alarmId: string,
  ringId: string,
): Promise<PlannerRingRow> {
  return api().call(E.dismissPlannerAlarm, {
    params: { alarmId },
    query: person(personId),
    body: { ringId },
  });
}

export async function skipNextPlannerAlarm(
  personId: PersonId,
  alarmId: string,
): Promise<PlannerAlarmRow> {
  return api().call(E.skipNextPlannerAlarm, { params: { alarmId }, query: person(personId) });
}

export async function startPlannerTimer(
  personId: PersonId,
  body: Body<'startPlannerTimer'>,
): Promise<PlannerTimerRow> {
  return api().call(E.startPlannerTimer, { query: person(personId), body });
}

export type PlannerTimerAction = 'pause' | 'resume' | 'cancel';

const TIMER_ACTIONS = {
  pause: E.pausePlannerTimer,
  resume: E.resumePlannerTimer,
  cancel: E.cancelPlannerTimer,
} as const;

export async function actOnPlannerTimer(
  personId: PersonId,
  timerId: string,
  action: PlannerTimerAction,
): Promise<PlannerTimerRow> {
  return api().call(TIMER_ACTIONS[action], { params: { timerId }, query: person(personId) });
}

export async function addPlannerTimerTime(
  personId: PersonId,
  timerId: string,
  ms: number,
): Promise<PlannerTimerRow> {
  return api().call(E.addPlannerTimerTime, {
    params: { timerId },
    query: person(personId),
    body: { ms },
  });
}

export type PlannerStopwatchAction = 'start' | 'pause' | 'lap' | 'reset';

const STOPWATCH_ACTIONS = {
  start: E.startPlannerStopwatch,
  pause: E.pausePlannerStopwatch,
  lap: E.lapPlannerStopwatch,
  reset: E.resetPlannerStopwatch,
} as const;

export async function actOnPlannerStopwatch(
  personId: PersonId,
  action: PlannerStopwatchAction,
): Promise<PlannerStopwatchRow> {
  return api().call(STOPWATCH_ACTIONS[action], { query: person(personId) });
}
