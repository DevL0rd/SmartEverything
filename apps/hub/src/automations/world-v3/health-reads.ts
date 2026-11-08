import {
  FITNESS_GOAL_KEYS,
  HEALTH_METRICS,
  HEALTH_METRIC_UNITS,
  areaInScope,
  effectiveFitnessGoals,
  localClock,
  type FitnessGoalKey,
  type HealthMetric,
  type ProfileRow,
} from '@smarteverything/domain';
import { z } from 'zod';
import { currentExecutionAuthority, executionRole } from '../../assistant/turn-authority';
import { scopesOf } from '../../server/person-scope';
import type { Store } from '../../store/store';
import type { WorldReadDeps } from './deps';
import { parseInputs } from './inputs';
import { ReadFailure, outputsOf, type ReadHandlers, type ReadResult } from './read-port';
import { PERSON_REF } from './refs';
import { homeZone } from './zone';

const MILLILITRES_PER_LITRE = 1000;

const SIGNIFICANT_DIGITS = 12;

const MILLISECONDS_PER_MINUTE = 60_000;

const MILLISECONDS_PER_DAY = 86_400_000;

const DEFAULT_RANGE_DAYS = 7;

const TODAY_READ = z.object({ person: PERSON_REF });

const RANGE_READ = z.object({
  person: PERSON_REF,
  metric: z.enum(HEALTH_METRICS),
  days: z.number().int().min(1).default(DEFAULT_RANGE_DAYS),
});

const GOAL_METRICS: Readonly<Record<FitnessGoalKey, HealthMetric>> = {
  steps: 'steps',
  move_kcal: 'active_energy',
  active_minutes: 'exercise',
  sleep_minutes: 'sleep',
  hydration_ml: 'hydration',
};

type Amounts = Readonly<Record<FitnessGoalKey, number | undefined>>;

export function millilitresOf(litres: number): number {
  return Number((litres * MILLILITRES_PER_LITRE).toPrecision(SIGNIFICANT_DIGITS));
}

export function todayAt(deps: Pick<WorldReadDeps, 'store' | 'clock'>): string {
  const { year, month, day } = localClock(deps.clock.now(), homeZone(deps.store));
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

function daysBefore(day: string, back: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - back * MILLISECONDS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

export function hydrationOf(store: Pick<Store, 'health'>, profileId: string, day: string): number {
  const [row] = store.health.dailyRange(profileId, day, day, ['hydration']);
  return row === undefined ? 0 : millilitresOf(row.value);
}

function admit(store: Store, person: string): void {
  const authority = currentExecutionAuthority();
  if (authority === undefined || executionRole(authority) === 'owner') return;
  if (authority.profile_id !== person)
    throw new ReadFailure('Forbidden', 'Members can only read their own health.');
  if (!areaInScope(scopesOf(store, person), 'health'))
    throw new ReadFailure('Forbidden', 'Health is not part of your access; ask the owner.');
}

function profileOf(store: Store, person: string): ProfileRow {
  const profile = store.profiles.list().find((each) => each.id === person);
  if (profile === undefined) throw new ReadFailure('NotFound', `There is no person ${person}`);
  return profile;
}

function amountsOf(
  rows: readonly { readonly metric: HealthMetric; readonly value: number }[],
): Amounts {
  const figures = new Map(rows.map((row) => [row.metric, row.value]));
  const water = figures.get('hydration');
  return {
    steps: figures.get('steps'),
    move_kcal: figures.get('active_energy'),
    active_minutes: figures.get('exercise'),
    sleep_minutes: figures.get('sleep'),
    hydration_ml: water === undefined ? undefined : millilitresOf(water),
  };
}

function healthToday(deps: WorldReadDeps, person: string): ReadResult {
  admit(deps.store, person);
  const profile = profileOf(deps.store, person);
  const day = todayAt(deps);
  const amounts = amountsOf(
    deps.store.health.dailyRange(profile.id, day, day, Object.values(GOAL_METRICS)),
  );
  const goals = effectiveFitnessGoals(profile.fitness_goals);
  const sleep = amounts.sleep_minutes;
  return outputsOf({
    day,
    steps: amounts.steps,
    energy: amounts.move_kcal,
    sleep: sleep === undefined ? undefined : sleep * MILLISECONDS_PER_MINUTE,
    water: amounts.hydration_ml,
    goalsMet: FITNESS_GOAL_KEYS.filter((key) => (amounts[key] ?? 0) >= goals[key]).length,
    goalsTotal: FITNESS_GOAL_KEYS.length,
  });
}

function healthRange(
  deps: WorldReadDeps,
  ask: { readonly person: string; readonly metric: HealthMetric; readonly days: number },
): ReadResult {
  admit(deps.store, ask.person);
  const profile = profileOf(deps.store, ask.person);
  const today = todayAt(deps);
  const rows = deps.store.health.dailyRange(profile.id, daysBefore(today, ask.days - 1), today, [
    ask.metric,
  ]);
  const values = rows.map((row) => row.value);
  const total = values.reduce((sum, value) => sum + value, 0);
  return outputsOf({
    values,
    dates: rows.map((row) => row.day),
    count: rows.length,
    average: rows.length === 0 ? undefined : total / rows.length,
    unit: HEALTH_METRIC_UNITS[ask.metric],
  });
}

export function healthReadHandlers(deps: WorldReadDeps): ReadHandlers {
  return {
    'health.today': (inputs): ReadResult => {
      const { person } = parseInputs('health.today', TODAY_READ, inputs);
      return healthToday(deps, person);
    },
    'health.range': (inputs): ReadResult =>
      healthRange(deps, parseInputs('health.range', RANGE_READ, inputs)),
  };
}
