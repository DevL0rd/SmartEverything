import type { InclineScale, SessionDetail, SpeedZone } from '@smarteverything/domain';
import { zoneOf } from '@smarteverything/domain';
import { inclineText } from './counters-model';
import { minutesText } from './stats-model';
import { clockText } from './treadmill-model';

export const MAX_PROFILE_POINTS = 240;

export interface ProfilePoint {
  readonly t: number;
  readonly kmh: number;
  readonly incline: number | null;
}

export function thinned<T>(items: readonly T[], limit: number): readonly T[] {
  if (items.length <= limit) {
    return items;
  }
  const stride = items.length / limit;
  return Array.from({ length: limit }, (_, index) => items[Math.floor(index * stride)]).flatMap(
    (item) => (item === undefined ? [] : [item]),
  );
}

export function profileMax(points: readonly ProfilePoint[], floor: number): number {
  const top = points.reduce((most, point) => Math.max(most, point.kmh), 0);
  return Math.max(floor, Math.ceil(top + 1));
}

export function profilePath(
  points: readonly ProfilePoint[],
  box: { readonly width: number; readonly height: number; readonly yMax: number },
): string {
  const last = points[points.length - 1];
  if (last === undefined) {
    return '';
  }
  const span = Math.max(last.t, 1);
  return points
    .map((point, index) => {
      const x = (point.t / span) * box.width;
      const y = box.height - (Math.min(point.kmh, box.yMax) / box.yMax) * box.height;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

export function profileSummary(detail: SessionDetail, scale: InclineScale): string {
  const { session } = detail;
  const speed = `Speed over the session, ${clockText(session.activeSeconds)} long, average ${session.avgKmh.toFixed(1)} and top ${session.maxKmh.toFixed(1)} km/h`;
  return session.inclineMax === null
    ? speed
    : `${speed}. Incline up to ${inclineText(session.inclineMax, scale)}`;
}

export function inclineTop(points: readonly ProfilePoint[]): number | null {
  const seen = points.flatMap((point) => (point.incline === null ? [] : [point.incline]));
  return seen.length === 0 ? null : Math.max(...seen);
}

export function inclineAreaPath(
  points: readonly ProfilePoint[],
  box: { readonly width: number; readonly height: number; readonly top: number },
): string {
  const last = points[points.length - 1];
  if (last === undefined || box.top <= 0) {
    return '';
  }
  const span = Math.max(last.t, 1);
  const placed = points.flatMap((point) =>
    point.incline === null
      ? []
      : [
          {
            x: (point.t / span) * box.width,
            y: box.height - (point.incline / box.top) * box.height,
          },
        ],
  );
  const first = placed[0];
  const end = placed[placed.length - 1];
  if (first === undefined || end === undefined) {
    return '';
  }
  const line = placed.map((place) => `L${place.x.toFixed(1)} ${place.y.toFixed(1)}`).join('');
  return `M${first.x.toFixed(1)} ${String(box.height)}${line}L${end.x.toFixed(1)} ${String(box.height)}Z`;
}

export interface InclineRow {
  readonly key: string;
  readonly label: string;
  readonly share: number;
  readonly minutes: string;
}

export function inclineRows(
  seconds: Readonly<Record<string, number>>,
  scale: InclineScale,
): readonly InclineRow[] {
  const entries = Object.entries(seconds)
    .map(([key, value]) => ({ key, level: Number(key), value }))
    .filter((entry) => Number.isFinite(entry.level) && entry.value > 0)
    .sort((a, b) => a.level - b.level);
  const peak = Math.max(0, ...entries.map((entry) => entry.value));
  return entries.map((entry) => ({
    key: entry.key,
    label: inclineText(entry.level, scale),
    share: peak > 0 ? entry.value / peak : 0,
    minutes: entry.value < 60 ? `${String(Math.round(entry.value))} s` : minutesText(entry.value),
  }));
}

export interface SplitRow {
  readonly km: number;
  readonly pace: string;
  readonly share: number;
  readonly fast: boolean;
}

export function splitRows(splits: readonly number[]): readonly SplitRow[] {
  if (splits.length === 0) {
    return [];
  }
  const fastest = Math.min(...splits);
  return splits.map((seconds, index) => ({
    km: index + 1,
    pace: `${clockText(seconds)} /km`,
    share: Math.max(0.15, fastest / seconds),
    fast: seconds === fastest,
  }));
}

export interface StripPart {
  readonly key: string;
  readonly grow: number;
  readonly zone: SpeedZone | null;
}

export function stripParts(segments: SessionDetail['segments']): readonly StripPart[] {
  return segments.map((segment, index) => ({
    key: `${String(index)}-${String(segment.fromS)}`,
    grow: Math.max(segment.toS - segment.fromS, 0.0001),
    zone: segment.state === 'paused' ? null : zoneOf(segment.avgKmh),
  }));
}
