import type {
  PlannerDay,
  PlannerPreferences,
  PlannerRange,
  PlannerRingRow,
  PlannerStats,
  PlannerStatsRange,
} from '@smarteverything/domain';
import type { UseQueryResult } from '@tanstack/react-query';
import {
  readPlannerDay,
  readPlannerPreferences,
  readPlannerRange,
  readPlannerRings,
  readPlannerStats,
} from '../../../api/planner';
import { plannerKeys } from '../../../queries/keys';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { apiPerson, type PlannerPerson } from './person';

interface PlannerQuery<T> {
  readonly queryKey: readonly unknown[];
  readonly queryFn: () => Promise<T>;
}

export function dayQuery(person: PlannerPerson, date: string): PlannerQuery<PlannerDay> {
  return {
    queryKey: plannerKeys.day(person, date),
    queryFn: () => readPlannerDay(apiPerson(person), date),
  };
}

export function rangeQuery(
  person: PlannerPerson,
  from: string,
  to: string,
  collections: readonly string[] | null,
): PlannerQuery<PlannerRange> {
  return {
    queryKey: plannerKeys.range(person, from, to, collections),
    queryFn: () => readPlannerRange(apiPerson(person), from, to, collections ?? undefined),
  };
}

export function statsQuery(
  person: PlannerPerson,
  range: PlannerStatsRange,
): PlannerQuery<PlannerStats> {
  return {
    queryKey: plannerKeys.stats(person, range),
    queryFn: () => readPlannerStats(apiPerson(person), range),
  };
}

export function ringsQuery(
  person: PlannerPerson,
  from: string,
  to: string,
): PlannerQuery<PlannerRingRow[]> {
  return {
    queryKey: plannerKeys.rings(person, from, to),
    queryFn: () => readPlannerRings(apiPerson(person), from, to),
  };
}

export function preferencesQuery(person: PlannerPerson): PlannerQuery<PlannerPreferences> {
  return {
    queryKey: plannerKeys.preferences(person),
    queryFn: () => readPlannerPreferences(apiPerson(person)),
  };
}

export function usePlannerDay(person: PlannerPerson, date: string): UseQueryResult<PlannerDay> {
  return useScreenQuery(dayQuery(person, date));
}

export function usePlannerRange(
  person: PlannerPerson,
  from: string,
  to: string,
  collections: readonly string[] | null,
): UseQueryResult<PlannerRange> {
  return useScreenQuery(rangeQuery(person, from, to, collections));
}

export function usePlannerStats(
  person: PlannerPerson,
  range: PlannerStatsRange,
): UseQueryResult<PlannerStats> {
  return useScreenQuery(statsQuery(person, range));
}

export function usePlannerRings(
  person: PlannerPerson,
  from: string,
  to: string,
): UseQueryResult<PlannerRingRow[]> {
  return useScreenQuery(ringsQuery(person, from, to));
}

export function usePlannerPreferences(person: PlannerPerson): UseQueryResult<PlannerPreferences> {
  return useScreenQuery(preferencesQuery(person));
}
