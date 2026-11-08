import {
  PLANNER_COLOUR_KEYS,
  parsePlannerRrule,
  type JsonValue,
  type PlannerAttachment,
  type PlannerColourKey,
  type PlannerItemRow,
  type PlannerReminder,
} from '@smarteverything/domain';
import {
  VENDOR_MAX_REMINDER_OVERRIDES,
  type CalendarListEntry,
  type EventTime,
  type FieldMap,
  type GoogleEvent,
} from '@smarteverything/google';
import { instantOf, instantsOf, isoOf } from '../instants';

export type Fields = Readonly<Record<string, JsonValue>>;

export class MapError extends Error {
  override readonly name = 'MapError';
}

export const NO_TITLE = '(No title)';
export const MEET_TITLE = 'Google Meet';
export const PATCH_FIELDS = [
  'summary',
  'description',
  'location',
  'start',
  'end',
  'recurrence',
  'reminders',
] as const;
export const EVENT_TYPE_KEY = 'eventType';

const REFERENCE_HEX: Readonly<Record<PlannerColourKey, string>> = {
  work: '#8eaeff',
  family: '#5ed3cf',
  personal: '#a99bff',
  health: '#6fd39a',
  home: '#f49a8e',
  shopping: '#c2e070',
};

const READ_ONLY_ROLES: ReadonlySet<string> = new Set(['reader', 'freeBusyReader']);

function hueOf(hex: string): { readonly hue: number; readonly chroma: number } {
  const [red = 0, green = 0, blue = 0] = [1, 3, 5].map(
    (at) => Number.parseInt(hex.slice(at, at + 2), 16) / 255,
  );
  const high = Math.max(red, green, blue);
  const low = Math.min(red, green, blue);
  const chroma = high - low;
  if (chroma === 0) return { hue: 0, chroma };
  const sector =
    high === red
      ? ((green - blue) / chroma) % 6
      : high === green
        ? (blue - red) / chroma + 2
        : (red - green) / chroma + 4;
  return { hue: (sector * 60 + 360) % 360, chroma };
}

function hueGap(left: string, right: string): number {
  const gap = Math.abs(hueOf(left).hue - hueOf(right).hue);
  return Math.min(gap, 360 - gap);
}

export function colourKeyOf(background: string | undefined): PlannerColourKey {
  if (background === undefined || !/^#[0-9a-f]{6}$/i.test(background)) return 'personal';
  const lowered = background.toLowerCase();
  if (hueOf(lowered).chroma < 0.1) return 'personal';
  let best: PlannerColourKey = 'personal';
  let bestGap = Number.POSITIVE_INFINITY;
  for (const key of PLANNER_COLOUR_KEYS) {
    const gap = hueGap(lowered, REFERENCE_HEX[key]);
    if (gap < bestGap) {
      best = key;
      bestGap = gap;
    }
  }
  return best;
}

export function calendarName(entry: CalendarListEntry): string {
  const name = entry.summaryOverride ?? entry.summary ?? entry.id;
  return name.trim().length === 0 ? entry.id : name.trim();
}

export function isReadOnlyCalendar(entry: CalendarListEntry): boolean {
  return READ_ONLY_ROLES.has(entry.accessRole);
}

export function isReadOnlyType(eventType: string | undefined): boolean {
  return eventType !== undefined && eventType !== 'default';
}

function withSeconds(local: string): string {
  return local.length === 16 ? `${local}:00` : local;
}

function compact(local: string): string {
  return withSeconds(local).replaceAll('-', '').replaceAll(':', '');
}

function expand(value: string): string {
  const date = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  if (value.length === 8) return date;
  return `${date}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}`;
}

export function localOf(time: EventTime | undefined, zone: string | null): string {
  if (time?.date !== undefined) return time.date;
  if (time?.dateTime === undefined || zone === null) {
    throw new MapError('The event has no usable start or end.');
  }
  return Temporal.Instant.from(time.dateTime)
    .toZonedDateTimeISO(zone)
    .toPlainDateTime()
    .toString({ smallestUnit: 'second' });
}

function pointOf(local: string, zone: string | null): JsonValue {
  if (zone === null) return { date: local };
  const zoned = instantOf(local, zone).toZonedDateTimeISO(zone);
  return { dateTime: zoned.toString({ timeZoneName: 'never' }), timeZone: zone };
}

function plusDay(date: string, days: number): string {
  return Temporal.PlainDate.from(date).add({ days }).toString();
}

export function recurrenceLines(
  rrule: string,
  exdates: readonly string[],
  zone: string | null,
): readonly string[] {
  const lines = [`RRULE:${rrule}`];
  const values = [...new Set(exdates.map(compact))].sort();
  if (values.length === 0) return lines;
  const head = zone === null ? 'EXDATE;VALUE=DATE' : `EXDATE;TZID=${zone}`;
  return [...lines, `${head}:${values.join(',')}`];
}

interface ParsedRecurrence {
  readonly rrule: string | null;
  readonly exdates: readonly string[];
}

function exdateLocal(value: string, tzid: string | null, zone: string | null): string {
  if (zone === null) return expand(value.slice(0, 8));
  if (value.endsWith('Z')) return localOf({ dateTime: `${expand(value.slice(0, 15))}Z` }, zone);
  const local = expand(value.slice(0, 15));
  return tzid === null || tzid === zone
    ? local
    : Temporal.PlainDateTime.from(local)
        .toZonedDateTime(tzid)
        .withTimeZone(zone)
        .toPlainDateTime()
        .toString({ smallestUnit: 'second' });
}

function readExdates(line: string, zone: string | null): readonly string[] {
  const split = line.indexOf(':');
  const tzid = /TZID=([^;:]+)/i.exec(line.slice(0, split))?.[1] ?? null;
  return line
    .slice(split + 1)
    .split(',')
    .map((value) => exdateLocal(value.trim().toUpperCase(), tzid, zone));
}

export function parseRecurrence(
  lines: readonly string[] | undefined,
  zone: string | null,
): ParsedRecurrence {
  let rrule: string | null = null;
  const exdates: string[] = [];
  for (const line of lines ?? []) {
    if (/^RRULE:/i.test(line) && rrule === null) {
      rrule = line.slice(6);
    } else if (/^EXDATE[;:]/i.test(line)) {
      exdates.push(...readExdates(line, zone));
    } else {
      throw new MapError(`The recurrence line "${line.slice(0, 12)}" cannot be shown here.`);
    }
  }
  if (rrule !== null) {
    const parsed = parsePlannerRrule(rrule);
    if (!parsed.success) throw new MapError(parsed.message);
  }
  return { rrule, exdates: rrule === null ? [] : [...new Set(exdates)].sort() };
}

export function reminderField(minutes: readonly number[]): JsonValue {
  if (minutes.length === 0) return { useDefault: true };
  return {
    useDefault: false,
    overrides: minutes
      .slice(0, VENDOR_MAX_REMINDER_OVERRIDES)
      .map((value) => ({ method: 'popup', minutes: value })),
  };
}

export function eventReminders(event: GoogleEvent): readonly PlannerReminder[] {
  const overrides = event.reminders?.useDefault === true ? [] : (event.reminders?.overrides ?? []);
  return overrides
    .filter((override) => override.method === 'popup')
    .map((override) => ({ minutes_before: override.minutes }));
}

export function keptLocal(item: Pick<PlannerItemRow, 'reminders'>): number {
  return Math.max(0, item.reminders.length - VENDOR_MAX_REMINDER_OVERRIDES);
}

function timingFields(
  start: string,
  end: string | null,
  zone: string | null,
): Record<string, JsonValue> {
  if (zone === null) {
    return { start: pointOf(start, null), end: pointOf(plusDay(end ?? start, 1), null) };
  }
  return { start: pointOf(start, zone), end: pointOf(end ?? start, zone) };
}

export function itemFields(item: PlannerItemRow): Fields {
  const fields: Record<string, JsonValue> = {
    summary: item.title,
    reminders: reminderField(item.reminders.map((reminder) => reminder.minutes_before)),
  };
  if (item.notes !== '') fields['description'] = item.notes;
  if (item.location !== null) fields['location'] = item.location;
  if (item.start_local !== null) {
    Object.assign(fields, timingFields(item.start_local, item.end_local, item.time_zone));
  }
  if (item.rrule !== null) {
    fields['recurrence'] = [...recurrenceLines(item.rrule, item.exdates, item.time_zone)];
  }
  return fields;
}

export function eventZone(event: GoogleEvent, calendarZone: string | undefined): string | null {
  if (event.start?.date !== undefined) return null;
  const zone = event.start?.timeZone ?? calendarZone;
  if (zone === undefined) throw new MapError('The event has no time zone.');
  return zone;
}

function textFields(event: GoogleEvent): Record<string, JsonValue> {
  const fields: Record<string, JsonValue> = {};
  if (event.description !== undefined && event.description !== '') {
    fields['description'] = event.description;
  }
  if (event.location !== undefined && event.location.trim() !== '') {
    fields['location'] = event.location;
  }
  if (event.eventType !== undefined) fields[EVENT_TYPE_KEY] = event.eventType;
  return fields;
}

export function eventFields(event: GoogleEvent, zone: string | null): Fields {
  const start = localOf(event.start, zone);
  const endLocal = event.end === undefined ? start : localOf(event.end, zone);
  const fields: Record<string, JsonValue> = {
    summary: event.summary === undefined || event.summary.trim() === '' ? NO_TITLE : event.summary,
    reminders: reminderField(eventReminders(event).map((reminder) => reminder.minutes_before)),
    ...timingFields(start, zone === null ? plusDay(endLocal, -1) : endLocal, zone),
    ...textFields(event),
  };
  const parsed = parseRecurrence(event.recurrence, zone);
  if (parsed.rrule !== null) {
    fields['recurrence'] = [...recurrenceLines(parsed.rrule, parsed.exdates, zone)];
  }
  return fields;
}

export function patchable(fields: FieldMap): Fields {
  const picked: Record<string, JsonValue> = {};
  for (const name of PATCH_FIELDS) {
    const value: unknown = Reflect.get(fields, name);
    if (value !== undefined) Object.assign(picked, { [name]: value });
  }
  return picked;
}

export interface MappedItem {
  readonly title: string;
  readonly notes: string;
  readonly location: string | null;
  readonly start_local: string;
  readonly end_local: string | null;
  readonly time_zone: string | null;
  readonly all_day: boolean;
  readonly rrule: string | null;
  readonly exdates: readonly string[];
  readonly reminders: readonly PlannerReminder[];
  readonly start: string | null;
  readonly end: string | null;
  readonly series_end: string | null;
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function pointTime(fields: FieldMap, name: 'start' | 'end'): EventTime {
  const point: unknown = Reflect.get(fields, name);
  if (typeof point !== 'object' || point === null) throw new MapError(`The ${name} is missing.`);
  const date: unknown = Reflect.get(point, 'date');
  const dateTime: unknown = Reflect.get(point, 'dateTime');
  const timeZone: unknown = Reflect.get(point, 'timeZone');
  return {
    ...(typeof date === 'string' ? { date } : {}),
    ...(typeof dateTime === 'string' ? { dateTime } : {}),
    ...(typeof timeZone === 'string' ? { timeZone } : {}),
  };
}

function reminderMinutes(fields: FieldMap): readonly number[] {
  const value: unknown = Reflect.get(fields, 'reminders');
  const overrides: unknown =
    typeof value === 'object' && value !== null ? Reflect.get(value, 'overrides') : undefined;
  if (!Array.isArray(overrides)) return [];
  return overrides.flatMap((entry: unknown) => {
    const minutes: unknown =
      typeof entry === 'object' && entry !== null ? Reflect.get(entry, 'minutes') : undefined;
    return typeof minutes === 'number' ? [minutes] : [];
  });
}

function recurrenceOf(fields: FieldMap): readonly string[] | undefined {
  const value: unknown = Reflect.get(fields, 'recurrence');
  return Array.isArray(value) ? value.filter((line) => typeof line === 'string') : undefined;
}

export function mappedItem(fields: FieldMap, kept: readonly PlannerReminder[]): MappedItem {
  const start = pointTime(fields, 'start');
  const end = pointTime(fields, 'end');
  const zone = start.date === undefined ? (start.timeZone ?? null) : null;
  const startLocal = localOf(start, zone);
  const endLocal = localOf(end, zone);
  const lastDay = zone === null ? plusDay(endLocal, -1) : endLocal;
  const recurrence = parseRecurrence(recurrenceOf(fields), zone);
  const timing = {
    start_local: startLocal,
    end_local: lastDay === startLocal ? null : lastDay,
    time_zone: zone,
    all_day: zone === null,
    rrule: recurrence.rrule,
  };
  const instants = instantsOf(timing);
  return {
    title: nonEmpty(Reflect.get(fields, 'summary')) ?? NO_TITLE,
    notes: textOf(Reflect.get(fields, 'description')),
    location: nonEmpty(Reflect.get(fields, 'location')),
    ...timing,
    exdates: recurrence.exdates,
    reminders: [
      ...reminderMinutes(fields).map((minutes) => ({ minutes_before: minutes })),
      ...kept,
    ],
    ...instants,
  };
}

export function meetAttachments(
  event: GoogleEvent,
  current: readonly PlannerAttachment[],
): readonly PlannerAttachment[] {
  const others = current.filter(
    (attachment) => attachment.kind !== 'link' || attachment.title !== MEET_TITLE,
  );
  const entry = event.conferenceData?.entryPoints?.find(
    (point) => point.entryPointType === 'video',
  );
  const url = event.hangoutLink ?? entry?.uri;
  if (url === undefined || !/^https?:\/\//.test(url)) return others;
  return [...others, { kind: 'link', url, title: MEET_TITLE }];
}

export function instanceId(
  masterGoogleId: string,
  originalStart: string,
  zone: string | null,
): string {
  if (zone === null) return `${masterGoogleId}_${originalStart.replaceAll('-', '')}`;
  const stamp = isoOf(instantOf(originalStart, zone)).replace(/\.\d{3}/, '');
  return `${masterGoogleId}_${stamp.replaceAll('-', '').replaceAll(':', '')}`;
}
