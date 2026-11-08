import type { API_ENDPOINTS as E, PlannerPreferences } from '@smarteverything/domain';
import { useMemo } from 'react';
import type { z } from 'zod';
import {
  acceptPlannerProposal,
  actOnPlannerStopwatch,
  actOnPlannerTimer,
  addPlannerTimerTime,
  dismissPlannerAlarm,
  parsePlannerText,
  readPlannerFreeSlots,
  rejectPlannerProposal,
  skipNextPlannerAlarm,
  snoozePlannerAlarm,
  startPlannerTimer,
  suggestPlannerCompletion,
  writePlannerPreferences,
  type PlannerStopwatchAction,
  type PlannerTimerAction,
} from '../../../api/planner';
import { apiPerson, type PlannerPerson } from './person';

type Body<K extends keyof typeof E> = z.input<(typeof E)[K]['body']>;
type Output<K extends keyof typeof E> = z.output<(typeof E)[K]['response']>;

export interface ClockWrites {
  readonly snoozeAlarm: (alarmId: string, body: Body<'snoozePlannerAlarm'>) => Promise<unknown>;
  readonly dismissAlarm: (alarmId: string, ringId: string) => Promise<unknown>;
  readonly skipNextAlarm: (alarmId: string) => Promise<unknown>;
  readonly startTimer: (body: Body<'startPlannerTimer'>) => Promise<Output<'startPlannerTimer'>>;
  readonly actOnTimer: (timerId: string, action: PlannerTimerAction) => Promise<unknown>;
  readonly addTimerTime: (timerId: string, ms: number) => Promise<unknown>;
  readonly actOnStopwatch: (action: PlannerStopwatchAction) => Promise<unknown>;
}

export interface PlannerTools {
  readonly parse: (body: Body<'parsePlannerText'>) => Promise<Output<'parsePlannerText'>>;
  readonly suggestCompletion: (
    body: Body<'suggestPlannerCompletion'>,
  ) => Promise<Output<'suggestPlannerCompletion'>>;
  readonly freeSlots: (body: Body<'plannerFreeSlots'>) => Promise<Output<'plannerFreeSlots'>>;
  readonly acceptProposal: (id: string) => Promise<unknown>;
  readonly rejectProposal: (id: string) => Promise<void>;
  readonly writePreferences: (preferences: PlannerPreferences) => Promise<PlannerPreferences>;
}

export function clockWrites(person: PlannerPerson): ClockWrites {
  const who = apiPerson(person);
  return {
    snoozeAlarm: (alarmId, body) => snoozePlannerAlarm(who, alarmId, body),
    dismissAlarm: (alarmId, ringId) => dismissPlannerAlarm(who, alarmId, ringId),
    skipNextAlarm: (alarmId) => skipNextPlannerAlarm(who, alarmId),
    startTimer: (body) => startPlannerTimer(who, body),
    actOnTimer: (timerId, action) => actOnPlannerTimer(who, timerId, action),
    addTimerTime: (timerId, ms) => addPlannerTimerTime(who, timerId, ms),
    actOnStopwatch: (action) => actOnPlannerStopwatch(who, action),
  };
}

export function plannerTools(person: PlannerPerson): PlannerTools {
  const who = apiPerson(person);
  return {
    parse: (body) => parsePlannerText(who, body),
    suggestCompletion: (body) => suggestPlannerCompletion(who, body),
    freeSlots: (body) => readPlannerFreeSlots(who, body),
    acceptProposal: (id) => acceptPlannerProposal(who, id),
    rejectProposal: (id) => rejectPlannerProposal(who, id),
    writePreferences: (preferences) => writePlannerPreferences(who, preferences),
  };
}

export function usePlannerClockWrites(person: PlannerPerson): ClockWrites {
  return useMemo(() => clockWrites(person), [person]);
}

export function usePlannerTools(person: PlannerPerson): PlannerTools {
  return useMemo(() => plannerTools(person), [person]);
}
