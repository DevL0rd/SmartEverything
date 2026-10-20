import type { TreadmillLiveFrame } from '@smarteverything/domain';
import type { ChartPoint } from '../../../components/charts';
import { ZONES, zoneOf, type ZoneKey } from '../../../features/fitness/model/heart';

export interface LivePoint {
  readonly t: number;
  readonly speed: number;
  readonly distanceM: number;
  readonly steps: number | null;
  readonly cadence: number | null;
  readonly kcal: number | null;
  readonly incline: number | null;
  readonly heartRate: number | null;
  readonly climbM: number | null;
}

export const LIVE_WINDOW_MS = 5 * 60_000;

export function pointOf(frame: TreadmillLiveFrame): LivePoint {
  const { belt, body } = frame;
  return {
    t: Date.parse(frame.at),
    speed: belt.speedKmh,
    distanceM: belt.distanceM,
    steps: belt.steps,
    cadence: belt.cadence,
    kcal: body === null ? null : body.kcal,
    incline: belt.inclinePercent,
    heartRate: body === null ? null : body.heartRate,
    climbM: frame.session === null ? null : frame.session.climbM,
  };
}

export function appendPoint(
  history: readonly LivePoint[],
  point: LivePoint,
  spanMs: number = LIVE_WINDOW_MS,
): readonly LivePoint[] {
  const last = history[history.length - 1];
  if (last === undefined) {
    return [point];
  }
  if (point.t <= last.t) {
    return history;
  }
  if (point.distanceM < last.distanceM) {
    return [point];
  }
  const from = point.t - spanMs;
  return [...history.filter((entry) => entry.t >= from), point];
}

export function seedPoints(
  recent: readonly { readonly at: string; readonly kmh: number }[],
  spanMs: number = LIVE_WINDOW_MS,
): readonly LivePoint[] {
  return recent.reduce<readonly LivePoint[]>((history, entry) => {
    const t = Date.parse(entry.at);
    const last = history[history.length - 1];
    const travelled =
      last === undefined ? 0 : last.distanceM + (last.speed * Math.max(0, t - last.t)) / 3600;
    return appendPoint(
      history,
      {
        t,
        speed: entry.kmh,
        distanceM: travelled,
        steps: null,
        cadence: null,
        kcal: null,
        incline: null,
        heartRate: null,
        climbM: null,
      },
      spanMs,
    );
  }, []);
}

export function mergePoints(
  seeded: readonly LivePoint[],
  live: readonly LivePoint[],
): readonly LivePoint[] {
  const first = live[0];
  if (first === undefined) {
    return seeded;
  }
  const older = seeded.filter((point) => point.t < first.t);
  const last = older[older.length - 1];
  if (last === undefined) {
    return live;
  }
  const shift = first.distanceM - last.distanceM;
  return [
    ...older.map((point) => ({ ...point, distanceM: Math.max(0, point.distanceM + shift) })),
    ...live,
  ];
}

export function seriesOf(
  history: readonly LivePoint[],
  pick: (point: LivePoint) => number | null,
): readonly ChartPoint[] {
  return history.flatMap((point) => {
    const value = pick(point);
    return value === null ? [] : [{ t: point.t, v: value }];
  });
}

export function needsRefresh(
  before: TreadmillLiveFrame | null,
  after: TreadmillLiveFrame,
): boolean {
  if (before === null) {
    return true;
  }
  const { belt: was } = before;
  const { belt: now } = after;
  return (
    was.state !== now.state ||
    was.link !== now.link ||
    was.controlLost !== now.controlLost ||
    was.childLock !== now.childLock ||
    was.mode !== now.mode
  );
}

export function newerFrame(
  live: TreadmillLiveFrame | null,
  loaded: TreadmillLiveFrame,
): TreadmillLiveFrame {
  return live !== null && Date.parse(live.at) >= Date.parse(loaded.at) ? live : loaded;
}

export function steppedSeries(
  history: readonly LivePoint[],
  pick: (point: LivePoint) => number | null,
): readonly ChartPoint[] {
  const stepped: ChartPoint[] = [];
  let before: ChartPoint | null = null;
  for (const point of history) {
    const value = pick(point);
    if (value === null) {
      before = null;
    } else {
      if (before !== null && before.v !== value) {
        stepped.push({ t: point.t - 1, v: before.v });
      }
      before = { t: point.t, v: value };
      stepped.push(before);
    }
  }
  return stepped;
}

export function heartZoneSeconds(
  history: readonly LivePoint[],
  maxBpm: number,
): Readonly<Record<ZoneKey, number>> {
  const totals: Record<ZoneKey, number> = { warm: 0, easy: 0, aerobic: 0, hard: 0, peak: 0 };
  history.forEach((point, index) => {
    const next = history[index + 1];
    const zone = point.heartRate === null ? null : zoneOf(point.heartRate, maxBpm);
    if (next !== undefined && zone !== null) {
      totals[zone] += (next.t - point.t) / 1000;
    }
  });
  return totals;
}

export function heartZoneLabel(bpm: number, maxBpm: number): string | null {
  const key = zoneOf(bpm, maxBpm);
  return ZONES.find((zone) => zone.key === key)?.label ?? null;
}
