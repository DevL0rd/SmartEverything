import { isOwnSource, preferredShares, type HealthRecord } from '@smarteverything/domain';
import { max } from 'd3-array';
import { exerciseKindOf, isDistanceBased, prefersSpeed } from '../../health-log';
import { endOf, overlapping, recordsOfType, startOf, type RecordOf } from './records';
import { HOUR_MS, MINUTE_MS } from '../../../format/time';
import { decimal, twoDigits, withUnit } from '../../../format/number';

type Session = RecordOf<'ExerciseSession'>;

const PACE_MINIMUM_METERS = 1000;

const SAME_WORKOUT_OVERLAP = 0.5;

const SPEED_GAP_CAP_SECONDS = 30;

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

function sessionHours(session: Session): { readonly from: number; readonly to: number } {
  const first = Math.floor(startOf(session) / HOUR_MS);
  const last = Math.max(first + 1, Math.ceil(endOf(session) / HOUR_MS));
  return { from: first * HOUR_MS, to: last * HOUR_MS };
}

function attributed<T extends HealthRecord>(
  records: readonly T[],
  session: Session,
  amount: (record: T) => number,
): number | null {
  const hours = sessionHours(session);
  let total: number | null = null;
  for (const { record, share: counted } of preferredShares(
    overlapping(records, hours.from, hours.to),
  )) {
    const share = overlapShare(record, startOf(session), endOf(session));
    if (share > 0) {
      total = (total ?? 0) + amount(record) * counted * share;
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

function withinSessionHours(record: HealthRecord, session: Session): boolean {
  const hours = sessionHours(session);
  return startOf(record) >= hours.from && endOf(record) <= hours.to;
}

function distanceOf(records: readonly HealthRecord[], session: Session): number | null {
  const near = recordsOfType(records, 'Distance').filter((record) =>
    withinSessionHours(record, session),
  );
  return attributed(near, session, (record) => record.data.meters) ?? lapMeters(session);
}

function speedMeters(records: readonly HealthRecord[], session: Session): number | null {
  const from = startOf(session);
  const to = endOf(session);
  const samples = recordsOfType(records, 'Speed')
    .flatMap((record) => record.data.samples)
    .map((sample) => ({ at: Date.parse(sample.time), speed: sample.metersPerSecond }))
    .filter((sample) => sample.at >= from && sample.at <= to)
    .sort((left, right) => left.at - right.at);
  if (samples.length < 2) {
    return null;
  }
  return samples.slice(0, -1).reduce((total, sample, index) => {
    const next = samples[index + 1];
    const seconds = Math.min(((next?.at ?? sample.at) - sample.at) / 1000, SPEED_GAP_CAP_SECONDS);
    return total + sample.speed * seconds;
  }, 0);
}

function energyOf(records: readonly HealthRecord[], session: Session): number | null {
  return attributed(
    recordsOfType(records, 'ActiveCaloriesBurned'),
    session,
    (record) => record.data.kilocalories,
  );
}

export function workoutOf(session: Session, related: readonly HealthRecord[]): Workout {
  const start = startOf(session);
  const end = endOf(session);
  const minutes = (end - start) / MINUTE_MS;
  const meters = isDistanceBased(session.data.exerciseType)
    ? (distanceOf(related, session) ?? speedMeters(related, session))
    : null;
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
    maxBpm: max(heart, (sample) => sample.bpm) ?? null,
    secondsPerKm: paceOf(minutes, meters),
    route: routeOf(session),
    laps: session.data.laps.length,
    source: session.sourceApp,
  };
}

function paceOf(minutes: number, meters: number | null): number | null {
  return meters === null || meters < PACE_MINIMUM_METERS ? null : (minutes * 60) / (meters / 1000);
}

function sameWorkout(left: Workout, right: Workout): boolean {
  const overlap = Math.min(left.end, right.end) - Math.max(left.start, right.start);
  const shorter = Math.min(left.end - left.start, right.end - right.start);
  return shorter > 0 && overlap / shorter >= SAME_WORKOUT_OVERLAP;
}

function leading(left: Workout, right: Workout): { first: Workout; second: Workout } {
  const own = isOwnSource(left.source) !== isOwnSource(right.source);
  const leftFirst = own ? isOwnSource(left.source) : left.minutes >= right.minutes;
  return leftFirst ? { first: left, second: right } : { first: right, second: left };
}

function joined(left: Workout, right: Workout): Workout {
  const { first, second } = leading(left, right);
  const meters = first.meters ?? second.meters;
  return {
    ...first,
    meters,
    kilocalories: first.kilocalories ?? second.kilocalories,
    secondsPerKm: paceOf(first.minutes, meters),
    route: first.route.status === 'recorded' ? first.route : second.route,
    laps: Math.max(first.laps, second.laps),
  };
}

function oneWorkoutEach(workouts: readonly Workout[]): Workout[] {
  const kept: Workout[] = [];
  for (const workout of [...workouts].sort((left, right) => left.start - right.start)) {
    const at = kept.findIndex((known) => sameWorkout(known, workout));
    if (at < 0) {
      kept.push(workout);
    } else {
      const known = kept[at];
      kept[at] = known === undefined ? workout : joined(known, workout);
    }
  }
  return kept;
}

export function workoutsOf(records: readonly HealthRecord[]): Workout[] {
  return oneWorkoutEach(
    recordsOfType(records, 'ExerciseSession').map((session) => workoutOf(session, records)),
  ).sort((left, right) => right.start - left.start);
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
        hit: best(mine, (w) => w.secondsPerKm, true),
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

interface Flat {
  readonly x: number;
  readonly y: number;
}

interface Box {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

function boxOf(flat: readonly Flat[], seed: Flat): Box {
  return flat.reduce<Box>(
    (box, point) => ({
      left: Math.min(box.left, point.x),
      right: Math.max(box.right, point.x),
      top: Math.min(box.top, point.y),
      bottom: Math.max(box.bottom, point.y),
    }),
    { left: seed.x, right: seed.x, top: seed.y, bottom: seed.y },
  );
}

export function routeDrawing(points: readonly RoutePoint[], size: number): RouteDrawing | null {
  const [head, ...tail] = points;
  if (head === undefined || tail.length === 0) {
    return null;
  }
  const middle = points.reduce((sum, point) => sum + point.latitude, 0) / points.length;
  const squeeze = Math.cos((middle * Math.PI) / 180);
  const flat = points.map((point) => ({ x: point.longitude * squeeze, y: -point.latitude }));
  const { left, right, top, bottom } = boxOf(flat, {
    x: head.longitude * squeeze,
    y: -head.latitude,
  });
  const wide = right - left;
  const tall = bottom - top;
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
  return withUnit(`${String(Math.floor(whole / 60))}:${twoDigits(whole % 60)}`, '/km');
}

export function tempoText(code: number, secondsPerKm: number): string {
  return prefersSpeed(code)
    ? withUnit(decimal(3600 / secondsPerKm, 1), 'km/h')
    : paceText(secondsPerKm);
}
