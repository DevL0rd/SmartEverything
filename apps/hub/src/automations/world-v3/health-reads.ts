import {
  FITNESS_GOAL_KEYS,
  HEALTH_METRICS,
  HEALTH_METRIC_UNITS,
  effectiveFitnessGoals,
  localClock,
  type FitnessGoalKey,
  type HealthDailyRow,
  type HealthMetric,
  type ProfileRow,
} from '@smarteverything/domain';
import { z } from 'zod';
import { currentExecutionAuthority, executionRole } from '../../assistant/turn-authority';
import type { StoreHost } from '../../store/host/host';
import type { WorldHealthAsk } from './history-units';
import type { WorldReadDeps } from './deps';
import type { WorldSource } from './world-mirror';
import { parseInputs } from './inputs';
import {
  ReadFailure,
  outputsOf,
  type ReadHandlers,
  type ReadResult,
  type ReadScope,
} from './read-port';
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

export function todayAt(deps: {
  readonly world: Pick<WorldSource, 'settings'>;
  readonly clock: WorldReadDeps['clock'];
}): string {
  const { year, month, day } = localClock(deps.clock.now(), homeZone(deps.world));
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

function daysBefore(day: string, back: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - back * MILLISECONDS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

export async function hydrationOf(
  host: Pick<StoreHost, 'call'>,
  profileId: string,
  day: string,
): Promise<number> {
  const [row] = await host.call('health', 'dailyRange', profileId, day, day, ['hydration']);
  return row === undefined ? 0 : millilitresOf(row.value);
}

function scopedReader(person: string): boolean {
  const authority = currentExecutionAuthority();
  if (authority === undefined || executionRole(authority) === 'owner') return false;
  if (authority.profile_id !== person)
    throw new ReadFailure('Forbidden', 'Members can only read their own health.');
  return true;
}

function dailyRows(
  scope: ReadScope,
  ask: Omit<WorldHealthAsk, 'scoped'>,
): readonly HealthDailyRow[] {
  const found = scope.fetch('worldHealth', { ...ask, scoped: scopedReader(ask.profileId) });
  if (found.refused)
    throw new ReadFailure('Forbidden', 'Health is not part of your access; ask the owner.');
  return found.rows;
}

function profileOf(world: Pick<WorldSource, 'profiles'>, person: string): ProfileRow {
  const profile = world.profiles.list().find((each) => each.id === person);
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

function healthToday(deps: WorldReadDeps, person: string, scope: ReadScope): ReadResult {
  scopedReader(person);
  const profile = profileOf(deps.world, person);
  const day = todayAt({ world: deps.world, clock: scope });
  const amounts = amountsOf(
    dailyRows(scope, {
      profileId: profile.id,
      from: day,
      to: day,
      metrics: Object.values(GOAL_METRICS),
    }),
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
  scope: ReadScope,
): ReadResult {
  scopedReader(ask.person);
  const profile = profileOf(deps.world, ask.person);
  const today = todayAt({ world: deps.world, clock: scope });
  const rows = dailyRows(scope, {
    profileId: profile.id,
    from: daysBefore(today, ask.days - 1),
    to: today,
    metrics: [ask.metric],
  });
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
    'health.today': (inputs, scope): ReadResult => {
      const { person } = parseInputs('health.today', TODAY_READ, inputs);
      return healthToday(deps, person, scope);
    },
    'health.range': (inputs, scope): ReadResult =>
      healthRange(deps, parseInputs('health.range', RANGE_READ, inputs), scope),
  };
}
