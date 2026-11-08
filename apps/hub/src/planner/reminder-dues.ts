import type { PlannerItemRow, PlannerOccurrenceView } from '@smarteverything/domain';
import { isoOf } from './instants';

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const ACTIVE: ReadonlySet<string> = new Set(['open', 'missed']);

export interface Due {
  readonly at: Temporal.Instant;
  readonly kind: 'reminder' | 'missed';
  readonly item: PlannerItemRow;
  readonly view: PlannerOccurrenceView;
  readonly anchor: Temporal.Instant;
  readonly minutesBefore: number;
}

export interface Reach {
  readonly lead: number;
  readonly reach: number;
  readonly latest: number | null;
  readonly relevant: boolean;
}

function startOfDay(date: Temporal.PlainDate, zone: string): Temporal.Instant {
  return date.toZonedDateTime(zone).toInstant();
}

function anchorOf(view: PlannerOccurrenceView, zone: string): Temporal.Instant | null {
  if (view.all_day) {
    const date =
      view.start === null
        ? view.due_date
        : Temporal.Instant.from(view.start).toZonedDateTimeISO('UTC').toPlainDate().toString();
    return date === null ? null : startOfDay(Temporal.PlainDate.from(date), zone);
  }
  const point = view.kind === 'task' ? (view.due_at ?? view.start) : view.start;
  if (point !== null) return Temporal.Instant.from(point);
  return view.due_date === null ? null : startOfDay(Temporal.PlainDate.from(view.due_date), zone);
}

function missedAt(view: PlannerOccurrenceView, zone: string): Temporal.Instant | null {
  if (view.kind !== 'task') return null;
  if (view.due_at !== null) return Temporal.Instant.from(view.due_at);
  if (view.due_date === null) return null;
  return startOfDay(Temporal.PlainDate.from(view.due_date).add({ days: 1 }), zone);
}

export function duesOfView(view: PlannerOccurrenceView, item: PlannerItemRow, zone: string): Due[] {
  if (!ACTIVE.has(view.status)) return [];
  const dues: Due[] = [];
  const anchor = anchorOf(view, zone);
  if (anchor !== null) {
    for (const { minutes_before: minutesBefore } of item.reminders) {
      const at = anchor.subtract({ milliseconds: minutesBefore * MINUTE_MS });
      dues.push({ at, kind: 'reminder', item, view, anchor, minutesBefore });
    }
  }
  const boundary = missedAt(view, zone);
  if (boundary !== null) {
    dues.push({ at: boundary, kind: 'missed', item, view, anchor: boundary, minutesBefore: 0 });
  }
  return dues;
}

function extentOf(item: PlannerItemRow): number {
  if (item.start === null) return 0;
  const start = Date.parse(item.start);
  const stops = [item.end, item.due_at]
    .filter((stop) => stop !== null)
    .map((stop) => Date.parse(stop) - start);
  return Math.max(0, (item.estimate_minutes ?? 0) * MINUTE_MS, ...stops);
}

function latestOf(item: PlannerItemRow): number {
  const dueDay = item.due_date === null ? [] : [Date.parse(`${item.due_date}T00:00:00Z`)];
  const known = [item.series_end, item.end, item.due_at, item.start]
    .filter((moment) => moment !== null)
    .map((moment) => Date.parse(moment));
  return Math.max(0, ...known, ...dueDay) + 2 * DAY_MS;
}

export function reachOf(items: readonly PlannerItemRow[]): Reach {
  const relevant = items.filter(
    (item) => item.status === 'open' && (item.kind === 'task' || item.reminders.length > 0),
  );
  const open = relevant.some((item) => item.rrule !== null && item.series_end === null);
  return {
    lead: Math.max(0, ...items.map(extentOf)),
    reach:
      Math.max(0, ...items.flatMap((item) => item.reminders.map((r) => r.minutes_before))) *
      MINUTE_MS,
    latest: open ? null : Math.max(0, ...relevant.map(latestOf)),
    relevant: relevant.length > 0,
  };
}

export function ringKey(item: PlannerItemRow, at: Temporal.Instant): string {
  return `${item.id}|${isoOf(at)}`;
}
