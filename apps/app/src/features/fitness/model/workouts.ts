import type { HealthRecord } from '@smarteverything/domain';
import { exerciseKindOf, isDistanceBased, prefersSpeed } from '../../health-log';
import { endOf, recordsOfType, startOf, type RecordOf } from './records';
import { MINUTE_MS } from '../../../format/time';
import { decimal, withUnit } from '../../../format/number';

type Session = RecordOf<'ExerciseSession'>;

export interface HeartSample {
  readonly at: number;
  readonly bpm: number;
}

export interface RoutePoint {
  readonly latitude: number;
  readonly longitude: number;
}

type WorkoutRoute =
  | { readonly status: 'recorded'; readonly points: readonly RoutePoint[] }
  | { readonly status: 'consent_required' }
  | { readonly status: 'absent' };

export interface Workout {
  readonly recordId: string;
  readonly code: number;
  readonly name: string;
  readonly title: string | null;
  readonly notes: string | null;
  readonly start: number;
  readonly end: number;
  readonly minutes: number;
  readonly meters: number | null;
  readonly kilocalories: number | null;
  readonly heart: readonly HeartSample[];
  readonly averageBpm: number | null;
  readonly maxBpm: number | null;
  readonly secondsPerKm: number | null;
  readonly route: WorkoutRoute;
  readonly laps: number;
  readonly source: string;
}

function overlapShare(record: HealthRecord, from: number, to: number): number {
  const start = startOf(record);
  const end = endOf(record);
  if (end <= start) {
    return start >= from && start < to ? 1 : 0;
  }
  return Math.max(0, Math.min(end, to) - Math.max(start, from)) / (end - start);
}

function attributed(
  records: readonly HealthRecord[],
  session: Session,
  amount: (record: HealthRecord) => number | null,
): number | null {
  let total: number | null = null;
  for (const record of records) {
    const value = amount(record);
    const share = overlapShare(record, startOf(session), endOf(session));
    if (value !== null && share > 0) {
      total = (total ?? 0) + value * share;
    }
  }
  return total;
}

function lapMeters(session: Session): number | null {
  const laps = session.data.laps.map((lap) => lap.meters).filter((meters) => meters !== null);
  return laps.length === 0 ? null : laps.reduce((sum, meters) => sum + meters, 0);
}

function heartDuring(records: readonly HealthRecord[], from: number, to: number): HeartSample[] {
  return recordsOfType(records, 'HeartRate')
    .flatMap((record) =>
      record.data.samples.map((sample) => ({ at: Date.parse(sample.time), bpm: sample.bpm })),
    )
    .filter((sample) => sample.at >= from && sample.at <= to)
    .sort((left, right) => left.at - right.at);
}

function routeOf(session: Session): WorkoutRoute {
  const route = session.data.route;
  if (route.status !== 'recorded') {
    return route;
  }
  return {
    status: 'recorded',
    points: route.locations.map((location) => ({
      latitude: location.latitude,
      longitude: location.longitude,
    })),
  };
}

function distanceOf(records: readonly HealthRecord[], session: Session): number | null {
  return (
    attributed(recordsOfType(records, 'Distance'), session, (record) =>
      record.type === 'Distance' ? record.data.meters : null,
    ) ?? lapMeters(session)
  );
}

function energyOf(records: readonly HealthRecord[], session: Session): number | null {
  const amount = (record: HealthRecord): number | null =>
    record.type === 'ActiveCaloriesBurned' ? record.data.kilocalories : null;
  return attributed(recordsOfType(records, 'ActiveCaloriesBurned'), session, amount);
}

export function workoutOf(session: Session, related: readonly HealthRecord[]): Workout {
  const start = startOf(session);
  const end = endOf(session);
  const minutes = (end - start) / MINUTE_MS;
  const meters = isDistanceBased(session.data.exerciseType) ? distanceOf(related, session) : null;
  const heart = heartDuring(related, start, end);
  return {
    recordId: session.recordId,
    code: session.data.exerciseType,
    name: exerciseKindOf(session.data.exerciseType).name,
    title:
      session.data.title === null || session.data.title.trim() === '' ? null : session.data.title,
    notes: session.data.notes,
    start,
    end,
    minutes,
    meters,
    kilocalories: energyOf(related, session),
    heart,
    averageBpm:
      heart.length === 0 ? null : heart.reduce((sum, sample) => sum + sample.bpm, 0) / heart.length,
    maxBpm: heart.length === 0 ? null : Math.max(...heart.map((sample) => sample.bpm)),
    secondsPerKm: meters === null || meters < 100 ? null : (minutes * 60) / (meters / 1000),
    route: routeOf(session),
    laps: session.data.laps.length,
    source: session.sourceApp,
  };
}

export function workoutsOf(records: readonly HealthRecord[]): Workout[] {
  return recordsOfType(records, 'ExerciseSession')
    .map((session) => workoutOf(session, records))
    .sort((left, right) => right.start - left.start);
}

export interface PersonalRecord {
  readonly label: string;
  readonly activity: string;
  readonly workout: Workout;
  readonly value: number;
  readonly kind: 'meters' | 'minutes' | 'pace' | 'kilocalories';
}

function best(
  workouts: readonly Workout[],
  read: (workout: Workout) => number | null,
  lower: boolean,
): { readonly workout: Workout; readonly value: number } | null {
  let found: { readonly workout: Workout; readonly value: number } | null = null;
  for (const workout of workouts) {
    const value = read(workout);
    if (value !== null && (found === null || (lower ? value < found.value : value > found.value))) {
      found = { workout, value };
    }
  }
  return found;
}

const PACE_MINIMUM_METERS = 1000;

export function personalRecords(workouts: readonly Workout[]): PersonalRecord[] {
  const activities = [...new Set(workouts.map((workout) => workout.name))].sort();
  return activities.flatMap((activity) => {
    const mine = workouts.filter((workout) => workout.name === activity);
    const found: readonly {
      readonly label: string;
      readonly kind: PersonalRecord['kind'];
      readonly hit: { readonly workout: Workout; readonly value: number } | null;
    }[] = [
      {
        label: 'Longest distance',
        kind: 'meters',
        hit: best(mine, (w) => w.meters, false),
      },
      {
        label: 'Longest session',
        kind: 'minutes',
        hit: best(mine, (w) => w.minutes, false),
      },
      {
        label: mine.some((w) => prefersSpeed(w.code)) ? 'Fastest speed' : 'Fastest pace',
        kind: 'pace',
        hit: best(
          mine,
          (w) => (w.meters !== null && w.meters >= PACE_MINIMUM_METERS ? w.secondsPerKm : null),
          true,
        ),
      },
      {
        label: 'Most energy',
        kind: 'kilocalories',
        hit: best(mine, (w) => w.kilocalories, false),
      },
    ];
    return found.flatMap(({ label, kind, hit }) =>
      hit === null ? [] : [{ label, activity, kind, workout: hit.workout, value: hit.value }],
    );
  });
}

export interface RouteDrawing {
  readonly path: string;
  readonly width: number;
  readonly height: number;
  readonly start: { readonly x: number; readonly y: number };
}

export function routeDrawing(points: readonly RoutePoint[], size: number): RouteDrawing | null {
  const [head, ...tail] = points;
  if (head === undefined || tail.length === 0) {
    return null;
  }
  const middle = points.reduce((sum, point) => sum + point.latitude, 0) / points.length;
  const squeeze = Math.cos((middle * Math.PI) / 180);
  const flat = points.map((point) => ({ x: point.longitude * squeeze, y: -point.latitude }));
  const xs = flat.map((point) => point.x);
  const ys = flat.map((point) => point.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const wide = Math.max(...xs) - left;
  const tall = Math.max(...ys) - top;
  const scale = size / Math.max(wide, tall, 1e-9);
  const placed = flat.map((point) => ({ x: (point.x - left) * scale, y: (point.y - top) * scale }));
  const path = placed
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ');
  return {
    path,
    width: Math.max(wide * scale, 1),
    height: Math.max(tall * scale, 1),
    start: { x: (head.longitude * squeeze - left) * scale, y: (-head.latitude - top) * scale },
  };
}

export function paceText(secondsPerKm: number): string {
  const whole = Math.round(secondsPerKm);
  return `${String(Math.floor(whole / 60))}:${String(whole % 60).padStart(2, '0')} /km`;
}

export function tempoText(code: number, secondsPerKm: number): string {
  return prefersSpeed(code)
    ? withUnit(decimal(3600 / secondsPerKm, 1), 'km/h')
    : paceText(secondsPerKm);
}
