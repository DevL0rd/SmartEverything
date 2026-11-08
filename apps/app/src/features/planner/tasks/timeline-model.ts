import type {
  PlannerCollectionRow,
  PlannerColourKey,
  PlannerItemRow,
} from '@smarteverything/domain';
import { endOfDayKey, shiftDay, startOfDayKey, weekdayShort } from '../../../format/time';
import {
  byTaskOrder,
  dueLabelOf,
  isOverdue,
  matchesFilter,
  type TaskEntry,
  type TaskFilter,
} from './task-grouping';

export interface TimelineWindow {
  readonly from: string;
  readonly days: number;
}

export type BarTone = 'list' | 'overdue' | 'undated' | 'done';

export interface TimelineBar {
  readonly left: number;
  readonly right: number;
  readonly tone: BarTone;
  readonly label: string;
  readonly before: boolean;
  readonly after: boolean;
  readonly draggable: boolean;
}

export interface TimelineRow {
  readonly key: string;
  readonly entry: TaskEntry;
  readonly collection: PlannerCollectionRow | null;
  readonly bar: TimelineBar;
}

export interface TimelineDay {
  readonly day: string;
  readonly label: string;
  readonly today: boolean;
}

export interface TimelineInput {
  readonly entries: readonly TaskEntry[];
  readonly filter: TaskFilter;
  readonly collections: readonly PlannerCollectionRow[];
  readonly today: string;
  readonly now: number;
  readonly window: TimelineWindow;
}

interface Span {
  readonly start: number;
  readonly end: number;
}

export function windowSpanOf(window: TimelineWindow): Span {
  return {
    start: startOfDayKey(window.from),
    end: startOfDayKey(shiftDay(window.from, window.days)),
  };
}

export function fractionOf(moment: number, window: TimelineWindow): number {
  const span = windowSpanOf(window);
  return (moment - span.start) / (span.end - span.start);
}

function localMoment(value: string): number {
  return value.includes('T') ? new Date(value).getTime() : startOfDayKey(value);
}

function plannedStartOf(item: PlannerItemRow): number | null {
  if (item.rrule !== null) return null;
  if (item.start !== null) return Date.parse(item.start);
  return item.start_local === null ? null : localMoment(item.start_local);
}

function dueMomentOf(entry: TaskEntry): number | null {
  if (entry.dueAt !== null) return Date.parse(entry.dueAt);
  return entry.dueDay === null ? null : endOfDayKey(entry.dueDay);
}

function spanOf(entry: TaskEntry, now: number, today: string): Span & { readonly tone: BarTone } {
  const due = dueMomentOf(entry);
  if (due === null || entry.dueDay === null) return { start: now, end: Infinity, tone: 'undated' };
  const planned = plannedStartOf(entry.item);
  const start = planned !== null && planned < due ? planned : startOfDayKey(entry.dueDay);
  if (entry.done) return { start, end: due, tone: 'done' };
  if (isOverdue(entry, now, today))
    return { start: Math.min(start, due), end: now, tone: 'overdue' };
  return { start, end: due, tone: 'list' };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function timelineBarOf(
  entry: TaskEntry,
  { now, today, window }: Pick<TimelineInput, 'now' | 'today' | 'window'>,
): TimelineBar {
  const span = spanOf(entry, now, today);
  const left = fractionOf(span.start, window);
  const right = span.end === Infinity ? 1 : fractionOf(span.end, window);
  return {
    left: clamp01(left),
    right: clamp01(right),
    tone: span.tone,
    label: span.tone === 'undated' ? 'No date' : dueLabelOf(entry, today),
    before: right < 0,
    after: left > 1,
    draggable: entry.open && entry.item.rrule === null && right >= 0 && left <= 1,
  };
}

export type LabelSide = 'inside' | 'after' | 'before';

export interface BarLayout {
  readonly left: number;
  readonly right: number;
  readonly span: number;
  readonly side: LabelSide;
}

export const BAR_SIZES = { label: 56, least: 4, stub: 6 } as const;

export function barLayoutOf(bar: TimelineBar, width: number): BarLayout {
  const start = bar.left * width;
  const right = bar.right * width;
  const span = Math.max(right - start, bar.before || bar.after ? BAR_SIZES.stub : BAR_SIZES.least);
  const left = Math.min(start, width - span);
  if (span >= BAR_SIZES.label) return { left, right, span, side: 'inside' };
  return { left, right, span, side: width - right < BAR_SIZES.label ? 'before' : 'after' };
}

export function timelineRowsOf(input: TimelineInput): readonly TimelineRow[] {
  const { entries, filter, collections, today } = input;
  const byId = new Map(collections.map((row) => [row.id, row]));
  return entries
    .filter((entry) => matchesFilter(entry, filter, today))
    .sort(byTaskOrder)
    .map((entry) => ({
      key: `${entry.item.id}\n${entry.occurrenceKey ?? ''}`,
      entry,
      collection: byId.get(entry.item.collection_id) ?? null,
      bar: timelineBarOf(entry, input),
    }));
}

function dayNumber(day: string): string {
  return String(Number(day.slice(8, 10)));
}

export function timelineDaysOf(window: TimelineWindow, today: string): readonly TimelineDay[] {
  return Array.from({ length: window.days }, (_, index) => {
    const day = shiftDay(window.from, index);
    const weekday = weekdayShort(startOfDayKey(day));
    const numbered = index === 0 || day === today || dayNumber(day) === '1';
    return {
      day,
      label: numbered ? `${weekday} ${dayNumber(day)}` : weekday,
      today: day === today,
    };
  });
}

export function dropDayOf(fraction: number, window: TimelineWindow): string {
  const index = Math.min(window.days - 1, Math.max(0, Math.ceil(fraction * window.days) - 1));
  return shiftDay(window.from, index);
}

function sameTimeOn(at: string, day: string): string {
  const time = new Date(at);
  const moved = new Date(startOfDayKey(day));
  moved.setHours(time.getHours(), time.getMinutes(), time.getSeconds(), time.getMilliseconds());
  return moved.toISOString();
}

export interface DueChange {
  readonly due_date?: string;
  readonly due_at?: string;
}

export function dueChangeOf(item: PlannerItemRow, day: string): DueChange | null {
  if (item.due_at !== null) {
    const due_at = sameTimeOn(item.due_at, day);
    if (due_at === new Date(item.due_at).toISOString()) return null;
    return item.due_date === null ? { due_at } : { due_at, due_date: day };
  }
  return item.due_date === day ? null : { due_date: day };
}

export function sameTimelineRow(left: TimelineRow, right: TimelineRow): boolean {
  return (
    left.entry.item === right.entry.item &&
    left.entry.open === right.entry.open &&
    left.entry.done === right.entry.done &&
    left.entry.dueAt === right.entry.dueAt &&
    left.entry.dueDay === right.entry.dueDay &&
    left.collection === right.collection &&
    left.bar.left === right.bar.left &&
    left.bar.right === right.bar.right &&
    left.bar.tone === right.bar.tone &&
    left.bar.label === right.bar.label
  );
}

const LIST_BAR: Readonly<Record<PlannerColourKey, string>> = {
  work: 'border-viz-6/60 bg-viz-6/25',
  family: 'border-viz-1/60 bg-viz-1/25',
  personal: 'border-viz-3/60 bg-viz-3/25',
  health: 'border-positive/60 bg-positive/25',
  home: 'border-viz-4/60 bg-viz-4/25',
  shopping: 'border-viz-5/60 bg-viz-5/25',
};

const TONE_BAR: Readonly<Record<Exclude<BarTone, 'list'>, string>> = {
  overdue: 'border-critical/60 bg-critical/20',
  undated: 'border-dashed border-outline',
  done: 'border-transparent bg-surface-3',
};

export function barClassOf(row: TimelineRow): string {
  if (row.bar.tone !== 'list') return TONE_BAR[row.bar.tone];
  return row.collection === null ? 'border-outline bg-surface-3' : LIST_BAR[row.collection.colour];
}
