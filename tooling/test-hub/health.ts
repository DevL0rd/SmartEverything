import {
  HEALTH_BATCH,
  HEALTH_BATCH_LIMIT,
  HEALTH_ENTRY_INPUT,
  MEAL_TYPES,
  portionOf,
  type FoodRow,
  type MealType,
} from '@smarteverything/domain';
import type { Store } from '../../apps/hub/src/store/store.ts';
import { HISTORY_DAYS, HOUR_MS, daysAgo, dayKey, type Anchor } from './clock.ts';
import { FOODS } from './foods.ts';
import type { Random } from './random.ts';

const SOURCE = 'seed.health-connect';
const SOURCE_BATCH = { device: 'Synthetic phone', appVersion: '0.0.0' } as const;
const FAR = 3_600_000;

interface Persona {
  readonly steps: number;
  readonly restingHeart: number;
  readonly weightKg: number;
  readonly sleepHours: number;
  readonly workoutsPerWeek: number;
}

const PERSONAS: readonly Persona[] = [
  { steps: 8200, restingHeart: 58, weightKg: 74, sleepHours: 7.4, workoutsPerWeek: 4 },
  { steps: 6400, restingHeart: 62, weightKg: 61, sleepHours: 7.9, workoutsPerWeek: 3 },
  { steps: 9800, restingHeart: 54, weightKg: 83, sleepHours: 6.8, workoutsPerWeek: 5 },
];

export interface HealthResult {
  readonly records: number;
  readonly entries: number;
  readonly foods: number;
}

interface Subject {
  readonly store: Store;
  readonly profileId: string;
  readonly index: number;
  readonly persona: Persona;
  readonly anchor: Anchor;
  readonly rng: Random;
}

interface Day {
  readonly key: string;
  readonly day: number;
  readonly start: Date;
  readonly end: Date;
}

interface Interval {
  readonly id: string;
  readonly type: string;
  readonly start: Date;
  readonly end: Date;
  readonly data: unknown;
}

interface Instant {
  readonly id: string;
  readonly type: string;
  readonly at: Date;
  readonly data: unknown;
}

function interval({ id, type, start, end, data }: Interval): unknown {
  return {
    recordId: id,
    type,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    zoneOffsetSeconds: 0,
    sourceApp: SOURCE,
    lastModified: end.toISOString(),
    data,
  };
}

function instant({ id, type, at, data }: Instant): unknown {
  return {
    recordId: id,
    type,
    startTime: at.toISOString(),
    endTime: null,
    zoneOffsetSeconds: 0,
    sourceApp: SOURCE,
    lastModified: at.toISOString(),
    data,
  };
}

function activityRecords(subject: Subject, span: Day): unknown[] {
  const { persona, rng } = subject;
  const { key, start, end } = span;
  const active = rng.chance(0.18) ? 0.45 : 1;
  const steps = Math.round(persona.steps * active * rng.float(0.7, 1.3));
  const energy = (id: string, type: string, kilocalories: number): unknown =>
    interval({ id: `${id}-${key}`, type, start, end, data: { kilocalories } });
  return [
    interval({ id: `steps-${key}`, type: 'Steps', start, end, data: { count: steps } }),
    interval({
      id: `distance-${key}`,
      type: 'Distance',
      start,
      end,
      data: { meters: Math.round(steps * 0.74) },
    }),
    energy('active', 'ActiveCaloriesBurned', Math.round(steps * 0.045 + rng.float(80, 220))),
    energy('total', 'TotalCaloriesBurned', Math.round(1750 + steps * 0.045 + rng.float(0, 200))),
    interval({
      id: `floors-${key}`,
      type: 'FloorsClimbed',
      start,
      end,
      data: { floors: rng.int(2, 18) },
    }),
  ];
}

function heartRecords(subject: Subject, span: Day): unknown[] {
  const { persona, rng, anchor } = subject;
  const { key, start, end } = span;
  const at = (hours: number): Date => new Date(start.getTime() + hours * HOUR_MS);
  const samples = Array.from({ length: 12 }, (_, slot) => ({
    time: at(slot * 2 + 1).toISOString(),
    bpm: Math.round(persona.restingHeart + 8 + rng.float(0, 45)),
  })).filter((sample) => Date.parse(sample.time) < anchor.now.getTime());
  const rows: unknown[] = [
    instant({
      id: `rhr-${key}`,
      type: 'RestingHeartRate',
      at: at(7),
      data: { bpm: Math.round(persona.restingHeart + rng.float(-3, 4)) },
    }),
    instant({
      id: `hrv-${key}`,
      type: 'HeartRateVariabilityRmssd',
      at: at(6),
      data: { milliseconds: Math.round(rng.float(30, 80)) },
    }),
    instant({
      id: `spo2-${key}`,
      type: 'OxygenSaturation',
      at: at(3),
      data: { percent: Math.round(rng.float(95, 99)) },
    }),
  ];
  if (samples.length > 0)
    rows.push(interval({ id: `hr-${key}`, type: 'HeartRate', start, end, data: { samples } }));
  return rows;
}

function sleepRecords(subject: Subject, span: Day): unknown[] {
  const { persona, rng, anchor } = subject;
  const wake = new Date(span.start.getTime() + 7 * HOUR_MS);
  if (wake.getTime() >= anchor.now.getTime()) return [];
  const bed = new Date(wake.getTime() - persona.sleepHours * HOUR_MS * rng.float(0.85, 1.12));
  const length = wake.getTime() - bed.getTime();
  const cut = (share: number): Date => new Date(bed.getTime() + length * share);
  const stage = (from: Date, to: Date, code: number): unknown => ({
    startTime: from.toISOString(),
    endTime: to.toISOString(),
    stage: code,
  });
  const stages = [
    stage(bed, cut(0.1), 2),
    stage(cut(0.1), cut(0.4), 5),
    stage(cut(0.4), cut(0.55), 6),
    stage(cut(0.55), cut(0.85), 4),
    stage(cut(0.85), wake, 6),
  ];
  return [
    interval({
      id: `sleep-${span.key}`,
      type: 'SleepSession',
      start: bed,
      end: wake,
      data: { title: null, notes: null, stages },
    }),
  ];
}

function dailyRecords(subject: Subject, day: number): unknown[] {
  const { anchor, rng, index } = subject;
  const start = daysAgo(anchor, day);
  const end = new Date(Math.min(start.getTime() + 86_340_000, anchor.now.getTime() - 1000));
  if (end.getTime() <= start.getTime()) return [];
  const span: Day = { key: `${String(index)}-${dayKey(start)}`, day, start, end };
  const rows = [
    ...activityRecords(subject, span),
    ...heartRecords(subject, span),
    ...sleepRecords(subject, span),
  ];
  if (day % 7 === 0)
    rows.push(
      instant({
        id: `vo2-${span.key}`,
        type: 'Vo2Max',
        at: new Date(start.getTime() + 12 * HOUR_MS),
        data: { mlPerKgPerMin: Math.round(rng.float(38, 52) * 10) / 10, measurementMethod: 0 },
      }),
    );
  return rows;
}

function ingest(store: Store, profileId: string, records: readonly unknown[]): number {
  let stored = 0;
  for (let offset = 0; offset < records.length; offset += HEALTH_BATCH_LIMIT) {
    const batch = HEALTH_BATCH.parse({
      records: records.slice(offset, offset + HEALTH_BATCH_LIMIT),
      deletions: [],
      grantedTypes: [],
      source: SOURCE_BATCH,
    });
    stored += store.health.ingest(batch, profileId).stored;
  }
  return stored;
}

function entry(subject: Subject, input: unknown): void {
  subject.store.healthEntries.create(subject.profileId, HEALTH_ENTRY_INPUT.parse(input));
}

interface Meal {
  readonly row: FoodRow;
  readonly meal: MealType;
  readonly at: Date;
  readonly amount: number;
}

function mealEntry(subject: Subject, { row, meal, at, amount }: Meal): void {
  const portion = portionOf(row, amount);
  entry(subject, {
    type: 'Nutrition',
    startTime: at.toISOString(),
    endTime: new Date(at.getTime() + 15 * 60_000).toISOString(),
    zoneOffsetSeconds: 0,
    data: {
      name: row.name,
      mealType: MEAL_TYPES[meal],
      kilocalories: portion.kilocalories,
      kilocaloriesFromFat: null,
      grams: portion.grams,
    },
    food: {
      foodId: row.id,
      name: row.name,
      amount,
      unit: row.basis.unit,
      label: row.serving?.label ?? '',
      waterMl: portion.waterMl,
    },
  });
}

const MEAL_PLAN: readonly (readonly [MealType, number, readonly string[]])[] = [
  ['breakfast', 7.5, ['Oatmeal', 'Whole milk', 'Banana', 'Greek yoghurt', 'Espresso']],
  ['lunch', 12.5, ['Chicken breast', 'Brown rice', 'Mixed salad', 'Wholegrain bread']],
  ['dinner', 19, ['Salmon fillet', 'Brown rice', 'Mixed salad', 'Orange juice']],
  ['snack', 15.5, ['Almonds', 'Banana', 'Greek yoghurt']],
];

function past(subject: Subject, at: Date): boolean {
  return at.getTime() < subject.anchor.now.getTime() - FAR;
}

function logMeals(subject: Subject, base: Date, foods: readonly FoodRow[]): void {
  const { rng } = subject;
  for (const [meal, hour, names] of MEAL_PLAN) {
    if (meal === 'snack' && rng.chance(0.4)) continue;
    const picks = names.filter(() => rng.chance(0.75));
    const chosen = picks.length === 0 ? names.slice(0, 1) : picks;
    for (const [index, name] of chosen.entries()) {
      const row = foods.find((candidate) => candidate.name === name);
      const at = new Date(base.getTime() + (hour + index * 0.1) * HOUR_MS);
      if (row === undefined || !past(subject, at)) continue;
      const amount = Math.round((row.serving?.amount ?? 100) * rng.float(0.8, 1.6));
      mealEntry(subject, { row, meal, at, amount });
    }
  }
}

function instantEntry(subject: Subject, type: string, at: Date, data: unknown): void {
  if (!past(subject, at)) return;
  entry(subject, {
    type,
    startTime: at.toISOString(),
    endTime: null,
    zoneOffsetSeconds: 0,
    data,
    food: null,
  });
}

function logHydration(subject: Subject, base: Date): void {
  const first = base.getTime() + 10 * HOUR_MS;
  for (let glass = 0; glass < subject.rng.int(3, 7); glass += 1) {
    const at = new Date(first + glass * 90 * 60_000);
    if (!past(subject, at)) continue;
    entry(subject, {
      type: 'Hydration',
      startTime: at.toISOString(),
      endTime: new Date(at.getTime() + 60_000).toISOString(),
      zoneOffsetSeconds: 0,
      data: { liters: 0.25 },
      food: null,
    });
  }
}

function logMeasurements(subject: Subject, base: Date, day: number): void {
  const { persona, rng } = subject;
  if (day % 3 === 0) {
    const kilograms = persona.weightKg + rng.float(-0.8, 0.8) - day * 0.01;
    instantEntry(subject, 'Weight', new Date(base.getTime() + 8 * HOUR_MS), {
      kilograms: Math.round(kilograms * 10) / 10,
    });
  }
  if (day % 5 === 0)
    instantEntry(subject, 'BloodPressure', new Date(base.getTime() + 8.5 * HOUR_MS), {
      systolicMmHg: Math.round(rng.float(108, 128)),
      diastolicMmHg: Math.round(rng.float(68, 82)),
      bodyPosition: 0,
      measurementLocation: 0,
    });
}

function logWorkout(subject: Subject, base: Date): void {
  const { persona, rng } = subject;
  if (!rng.chance(persona.workoutsPerWeek / 7)) return;
  if (!past(subject, new Date(base.getTime() + 19 * HOUR_MS))) return;
  const start = new Date(base.getTime() + rng.float(6, 18.5) * HOUR_MS);
  entry(subject, {
    type: 'ExerciseSession',
    startTime: start.toISOString(),
    endTime: new Date(start.getTime() + rng.int(25, 70) * 60_000).toISOString(),
    zoneOffsetSeconds: 0,
    data: {
      exerciseType: rng.pick([56, 79, 8, 70, 83] as const),
      title: null,
      notes: null,
      plannedExerciseSessionId: null,
      segments: [],
      laps: [],
      route: { status: 'absent' },
    },
    food: null,
  });
}

function logDay(subject: Subject, day: number, foods: readonly FoodRow[]): void {
  const base = daysAgo(subject.anchor, day);
  logMeals(subject, base, foods);
  logHydration(subject, base);
  logMeasurements(subject, base, day);
  logWorkout(subject, base);
}

function seedPerson(subject: Subject): { records: number; foods: number } {
  const { store, profileId } = subject;
  const saved = FOODS.map((candidate) => store.foods.save(profileId, candidate));
  const daily: unknown[] = [];
  for (let day = HISTORY_DAYS; day >= 0; day -= 1) daily.push(...dailyRecords(subject, day));
  const records = ingest(store, profileId, daily);
  for (let day = HISTORY_DAYS; day >= 0; day -= 1) logDay(subject, day, saved);
  return { records, foods: saved.length };
}

function entryCount(store: Store): number {
  const row = store.database.prepare('select count(*) as n from health_entries').get();
  return typeof row?.['n'] === 'number' ? row['n'] : 0;
}

export function seedHealth(
  store: Store,
  profiles: readonly string[],
  anchor: Anchor,
  rng: Random,
): HealthResult {
  let records = 0;
  let foods = 0;
  for (const [index, profileId] of profiles.entries()) {
    const persona = PERSONAS[index % PERSONAS.length];
    if (persona === undefined) throw new Error('No persona.');
    const done = seedPerson({ store, profileId, index, persona, anchor, rng });
    records += done.records;
    foods += done.foods;
  }
  return { records, entries: entryCount(store), foods };
}
