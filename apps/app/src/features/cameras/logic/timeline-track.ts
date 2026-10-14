import type { TimelineKind } from './timeline';

const ZOOM_LEVELS = [24, 12, 6, 3, 1] as const;

export type ZoomHours = (typeof ZOOM_LEVELS)[number];

export interface TrackItem {
  readonly id: string;
  readonly fraction: number;
  readonly kind: TimelineKind;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly time: string;
  readonly thumb: string | null;
}

const SNAP_FRACTION = 15 / (24 * 60);

export function nearest(
  items: readonly TrackItem[],
  fraction: number,
  within: number = SNAP_FRACTION,
): TrackItem | null {
  let best: TrackItem | null = null;
  for (const item of items) {
    const distance = Math.abs(item.fraction - fraction);
    if (distance <= within && (best === null || distance < Math.abs(best.fraction - fraction))) {
      best = item;
    }
  }
  return best;
}

export function fractionTime(fraction: number): string {
  const minutes = Math.round(Math.min(1, Math.max(0, fraction)) * 24 * 60);
  const hour = Math.floor(minutes / 60) % 24;
  return `${String(hour).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export interface TrackMark {
  readonly id: string;
  readonly x: number;
  readonly kind: TimelineKind;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly ids: readonly string[];
}

export function trackWidth(viewport: number, hours: ZoomHours): number {
  return Math.round((viewport * 24) / hours);
}

export function marksAlong(
  items: readonly TrackItem[],
  width: number,
  minGap: number,
): TrackMark[] {
  const sorted = [...items].sort((left, right) => left.fraction - right.fraction);
  const marks: TrackMark[] = [];
  for (const item of sorted) {
    const x = item.fraction * width;
    const last = marks.at(-1);
    if (last !== undefined && x - last.x < minGap) {
      marks[marks.length - 1] = { ...last, ids: [...last.ids, item.id] };
    } else {
      marks.push({ id: item.id, x, kind: item.kind, details: item.details ?? {}, ids: [item.id] });
    }
  }
  return marks;
}

export function hourTicks(hours: ZoomHours): readonly number[] {
  const every = hours >= 12 ? 3 : 1;
  return Array.from({ length: 24 / every + 1 }, (_, index) => index * every);
}

export function zoomStep(hours: ZoomHours, step: 1 | -1): ZoomHours {
  const index = ZOOM_LEVELS.indexOf(hours) + step;
  return ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, Math.max(0, index))] ?? hours;
}
