import type {
  PlannerCollectionRow,
  PlannerOccurrenceView,
  PlannerRange,
} from '@smarteverything/domain';
import { rounded } from '../../../format/number';
import type { ClockFormat } from '../../../format/clock-text';
import { localDayKey } from '../../../format/time';
import type { Prefs } from '../settings/preferences';
import type { MinuteSpan } from './grid-gestures';
import { dayLabelOf } from './month-model';
import { timedSpansOn } from './time-grid-layout';

export interface Booked {
  readonly collection: PlannerCollectionRow;
  readonly minutes: number;
}

export interface BookedInput {
  readonly occurrences: readonly PlannerOccurrenceView[];
  readonly collections: readonly PlannerCollectionRow[];
  readonly days: readonly string[];
  readonly timeZone: string;
}

export function minutesByCollectionOf(
  input: Omit<BookedInput, 'collections'>,
): Map<string, number> {
  const minutes = new Map<string, number>();
  const events = busyOf(input.occurrences);
  for (const day of input.days) {
    for (const span of timedSpansOn(events, day, input.timeZone)) {
      const id = span.occurrence.collection_id;
      minutes.set(id, (minutes.get(id) ?? 0) + span.to - span.from);
    }
  }
  return minutes;
}

export function bookedOf(input: BookedInput): readonly Booked[] {
  const minutes = minutesByCollectionOf(input);
  return input.collections
    .filter((collection) => collection.kind === 'calendar')
    .map((collection) => ({ collection, minutes: minutes.get(collection.id) ?? 0 }));
}

export function totalOf(booked: readonly Booked[]): number {
  return booked.reduce((sum, entry) => sum + entry.minutes, 0);
}

export function clockMinutesOf(text: string): number {
  const [hour = '0', minute = '0'] = text.split(':');
  return Number(hour) * 60 + Number(minute);
}

export function dayWindowOf(general: Prefs['general']): MinuteSpan {
  const from = clockMinutesOf(general.day_start);
  const end = clockMinutesOf(general.day_end);
  return {
    from: Math.floor(from / 60) * 60,
    to: Math.min(1440, Math.ceil((end <= from ? 1440 : end) / 60) * 60),
  };
}

export function freeGapsOf(busy: readonly MinuteSpan[], window: MinuteSpan): readonly MinuteSpan[] {
  const gaps: MinuteSpan[] = [];
  let cursor = window.from;
  for (const span of [...busy].sort((left, right) => left.from - right.from)) {
    if (span.from >= window.to) break;
    if (span.from > cursor) gaps.push({ from: cursor, to: span.from });
    cursor = Math.max(cursor, span.to);
  }
  if (cursor < window.to) gaps.push({ from: cursor, to: window.to });
  return gaps;
}

export function openWindowOf(window: MinuteSpan, now: number | null): MinuteSpan {
  return { from: now === null ? window.from : Math.max(window.from, now), to: window.to };
}

export function busyOf(occurrences: readonly PlannerOccurrenceView[]): PlannerOccurrenceView[] {
  return occurrences.filter((view) => view.kind === 'event' && view.status !== 'proposed');
}

export function dueOn(
  occurrences: readonly PlannerOccurrenceView[],
  day: string,
  timeZone: string,
): readonly PlannerOccurrenceView[] {
  return occurrences.filter(
    (view) =>
      view.kind === 'task' &&
      view.status !== 'cancelled' &&
      view.status !== 'proposed' &&
      (view.due_date === day ||
        (view.due_at !== null && localDayKey(Date.parse(view.due_at), timeZone) === day)),
  );
}

export function eventTextOf(day: string, gap: MinuteSpan, format: ClockFormat): string {
  return `${dayLabelOf(day, true)} ${format.minutes(gap.from)} to ${format.minutes(gap.to)}`;
}

export function hoursText(minutes: number): string {
  return `${rounded(minutes / 60, 1)} h`;
}

export function loadLineOf(now: number, before: number | null, previous: string): string | null {
  if (before === null) return null;
  if (now === before) return `Same as ${previous}`;
  const change = now > before ? 'Up' : 'Down';
  return `${change} ${hoursText(Math.abs(now - before))} on ${previous}`;
}

export function bookedLineOf(
  range: PlannerRange | undefined,
  input: Omit<BookedInput, 'occurrences'>,
): string | null {
  if (range === undefined) return null;
  const total = totalOf(bookedOf({ ...input, occurrences: range.occurrences }));
  return total === 0 ? null : `${hoursText(total)} booked`;
}
