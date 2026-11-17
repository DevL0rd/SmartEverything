import type {
  PlannerBookingPageRow,
  PlannerBookingWindow,
  PlannerCollectionRow,
  PlannerGuestRow,
  PlannerItemRow,
} from '@smarteverything/domain';
import type { ClockFormat } from '../../../format/clock-text';
import { compareText } from '../../../format/text';

export const SLOT_MINUTES = 30;

export const SLOTS_PER_DAY = (24 * 60) / SLOT_MINUTES;

const LAST_MINUTE = 24 * 60 - 1;

const WEEK = 7;

export type BookingCells = ReadonlySet<number>;

export interface BookingCell {
  readonly day: number;
  readonly slot: number;
}

export function minuteOfTime(time: string): number {
  const [hours = '0', minutes = '0'] = time.split(':');
  return Number(hours) * 60 + Number(minutes);
}

export function timeOfMinute(minute: number): string {
  const clamped = Math.min(minute, LAST_MINUTE);
  const hours = Math.floor(clamped / 60);
  return `${String(hours).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

export function cellKeyOf({ day, slot }: BookingCell): number {
  return day * SLOTS_PER_DAY + slot;
}

export function cellOfKey(key: number): BookingCell {
  return { day: Math.floor(key / SLOTS_PER_DAY), slot: key % SLOTS_PER_DAY };
}

export function cellsOf(windows: readonly PlannerBookingWindow[]): BookingCells {
  const cells = new Set<number>();
  for (const window of windows) {
    const first = Math.floor(minuteOfTime(window.start) / SLOT_MINUTES);
    const last = Math.ceil(minuteOfTime(window.end) / SLOT_MINUTES);
    for (let slot = first; slot < last; slot += 1) cells.add(cellKeyOf({ day: window.day, slot }));
  }
  return cells;
}

function runsOf(slots: readonly number[]): readonly (readonly [number, number])[] {
  const runs: [number, number][] = [];
  for (const slot of slots) {
    const run = runs.at(-1);
    if (run?.[1] === slot) run[1] = slot + 1;
    else runs.push([slot, slot + 1]);
  }
  return runs;
}

export function windowsOf(cells: BookingCells): readonly PlannerBookingWindow[] {
  const ordered = [...cells].sort((left, right) => left - right).map(cellOfKey);
  return Array.from({ length: WEEK }, (_, day) => day).flatMap((day) =>
    runsOf(ordered.filter((cell) => cell.day === day).map((cell) => cell.slot)).map(
      ([from, to]) => ({
        day,
        start: timeOfMinute(from * SLOT_MINUTES),
        end: timeOfMinute(to * SLOT_MINUTES),
      }),
    ),
  );
}

export function paintedCells(
  cells: BookingCells,
  from: BookingCell,
  to: BookingCell,
  on: boolean,
): BookingCells {
  const next = new Set(cells);
  const [firstDay, lastDay] = [Math.min(from.day, to.day), Math.max(from.day, to.day)];
  const [firstSlot, lastSlot] = [Math.min(from.slot, to.slot), Math.max(from.slot, to.slot)];
  for (let day = firstDay; day <= lastDay; day += 1) {
    for (let slot = firstSlot; slot <= lastSlot; slot += 1) {
      const key = cellKeyOf({ day, slot });
      if (on) next.add(key);
      else next.delete(key);
    }
  }
  return next;
}

export function workingWindowsOf(working: {
  readonly days: readonly number[];
  readonly start: string;
  readonly end: string;
}): readonly PlannerBookingWindow[] {
  if (minuteOfTime(working.start) >= minuteOfTime(working.end)) return [];
  return [...working.days]
    .sort((left, right) => left - right)
    .map((day) => ({ day, start: working.start, end: working.end }));
}

export function weeklyMinutesOf(windows: readonly PlannerBookingWindow[]): number {
  return windows.reduce(
    (total, window) => total + minuteOfTime(window.end) - minuteOfTime(window.start),
    0,
  );
}

function dayTextOf(
  windows: readonly PlannerBookingWindow[],
  day: number,
  format: ClockFormat,
): string {
  return windows
    .filter((window) => window.day === day)
    .map((window) => `${format.text(window.start)}–${format.text(window.end)}`)
    .join(', ');
}

function dayRangeOf(days: readonly number[], name: (day: number) => string): string {
  const first = days[0];
  const last = days.at(-1);
  if (first === undefined || last === undefined) return '';
  if (days.length === 1) return name(first);
  if (days.length === 2) return `${name(first)}, ${name(last)}`;
  return `${name(first)}–${name(last)}`;
}

export function availabilitySummaryOf(
  windows: readonly PlannerBookingWindow[],
  order: readonly number[],
  name: (day: number) => string,
  format: ClockFormat,
): string {
  const groups: { text: string; days: number[] }[] = [];
  for (const day of order) {
    const text = dayTextOf(windows, day, format);
    const group = groups.at(-1);
    if (text === '') continue;
    const previous = group?.days.at(-1);
    const next = previous === undefined ? -1 : order[order.indexOf(previous) + 1];
    if (group?.text === text && next === day) group.days.push(day);
    else groups.push({ text, days: [day] });
  }
  if (groups.length === 0) return 'No open times';
  return groups.map((group) => `${dayRangeOf(group.days, name)} ${group.text}`).join(' · ');
}

export type BookingReach = 'public' | 'home' | 'unknown';

export interface BookingLink {
  readonly url: string | null;
  readonly reach: BookingReach;
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}${path}`;
}

export function bookingLinkOf(
  token: string,
  base: { readonly publicUrl: string | null; readonly hubUrl: string | null },
): BookingLink {
  const path = `/book/${encodeURIComponent(token)}`;
  if (base.publicUrl !== null) return { url: joinUrl(base.publicUrl, path), reach: 'public' };
  if (base.hubUrl !== null) return { url: joinUrl(base.hubUrl, path), reach: 'home' };
  return { url: null, reach: 'unknown' };
}

export interface UpcomingBooking {
  readonly item: PlannerItemRow;
  readonly start: number;
  readonly booker: PlannerGuestRow | null;
}

export function isLiveBooking(item: PlannerItemRow): boolean {
  return (
    item.created_by === 'booking' &&
    item.deleted_at === null &&
    item.status !== 'cancelled' &&
    item.start !== null
  );
}

export function upcomingBookingsOf(
  items: readonly PlannerItemRow[],
  guests: readonly PlannerGuestRow[],
  now: number,
): readonly UpcomingBooking[] {
  return items
    .filter(isLiveBooking)
    .map((item) => ({
      item,
      start: Date.parse(item.start ?? ''),
      end: Date.parse(item.end ?? item.start ?? ''),
      booker: guests.find((guest) => guest.item_id === item.id && guest.kind === 'email') ?? null,
    }))
    .filter((booking) => booking.end >= now)
    .sort((left, right) => left.start - right.start)
    .map(({ item, start, booker }) => ({ item, start, booker }));
}

export interface BookingDay {
  readonly day: string;
  readonly count: number;
}

export function bookingWeekOf(
  items: readonly PlannerItemRow[],
  days: readonly string[],
  dayOf: (moment: number) => string,
): readonly BookingDay[] {
  const counts = new Map<string, number>();
  for (const item of items.filter(isLiveBooking)) {
    const day = dayOf(Date.parse(item.start ?? ''));
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return days.map((day) => ({ day, count: counts.get(day) ?? 0 }));
}

export function pageBookingsOf(
  items: readonly PlannerItemRow[],
  pageId: string,
): readonly PlannerItemRow[] {
  return items.filter((item) => item.booking_page_id === pageId);
}

export function bookingCalendarsOf(
  collections: readonly PlannerCollectionRow[],
): readonly PlannerCollectionRow[] {
  return collections.filter(
    (collection) => collection.kind === 'calendar' && collection.source !== 'feed',
  );
}

export function bookingPageOrderOf(
  pages: readonly PlannerBookingPageRow[],
): readonly PlannerBookingPageRow[] {
  return [...pages].sort(
    (left, right) =>
      Number(right.enabled) - Number(left.enabled) ||
      compareText(left.title, right.title) ||
      compareText(left.id, right.id),
  );
}

const DAY_MINUTES = 24 * 60;

export function spanTextOf(minutes: number): string {
  if (minutes === 0) return 'None';
  const days = Math.floor(minutes / DAY_MINUTES);
  const hours = Math.floor((minutes % DAY_MINUTES) / 60);
  const rest = minutes % 60;
  const parts = [
    days === 0 ? null : `${String(days)} ${days === 1 ? 'day' : 'days'}`,
    hours === 0 ? null : `${String(hours)} h`,
    rest === 0 ? null : `${String(rest)} min`,
  ];
  return parts.filter((part) => part !== null).join(' ');
}

export function aheadTextOf(days: number): string {
  if (days % 7 === 0) {
    const weeks = days / 7;
    return `${String(weeks)} ${weeks === 1 ? 'week' : 'weeks'}`;
  }
  return `${String(days)} ${days === 1 ? 'day' : 'days'}`;
}

export function bookerNameOf(booking: UpcomingBooking): string {
  return booking.booker?.name ?? booking.booker?.email ?? booking.item.title;
}

export function nextDaysOf(
  today: string,
  shift: (day: string, by: number) => string,
): readonly string[] {
  return Array.from({ length: WEEK }, (_, index) => shift(today, index));
}

export interface HourSpan {
  readonly from: number;
  readonly to: number;
}

export function hourSpanOf(windows: readonly PlannerBookingWindow[]): HourSpan {
  if (windows.length === 0) return { from: 0, to: 24 * 60 };
  const from = Math.min(...windows.map((window) => minuteOfTime(window.start)));
  const to = Math.max(...windows.map((window) => minuteOfTime(window.end)));
  return { from: Math.floor(from / 60) * 60, to: Math.min(24 * 60, Math.ceil(to / 60) * 60) };
}

export function gridSpanOf(
  windows: readonly PlannerBookingWindow[],
  day: { readonly start: string; readonly end: string } | null,
): HourSpan {
  if (day === null || minuteOfTime(day.end) <= minuteOfTime(day.start)) {
    return { from: 0, to: 24 * 60 };
  }
  const own = hourSpanOf([{ day: 0, start: day.start, end: day.end }]);
  if (windows.length === 0) return own;
  const open = hourSpanOf(windows);
  return { from: Math.min(own.from, open.from), to: Math.max(own.to, open.to) };
}

export function weeklyTextOf(minutes: number): string {
  if (minutes === 0) return 'No open times yet';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const text = [
    hours === 0 ? null : `${String(hours)} h`,
    rest === 0 ? null : `${String(rest)} min`,
  ]
    .filter((part) => part !== null)
    .join(' ');
  return `${text} a week`;
}
