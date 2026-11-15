import type { PlannerGuestRow, PlannerItemRow } from '@smarteverything/domain';
import type { PlannerItemInput } from '../../store/repositories/planner-items';
import { instantOf, instantsOf } from '../instants';
import type { IcalContent, IcalEntry, IcalGuest, IcalOverride, IcalTiming } from './model';

export const NO_TITLE = '(No title)';

export const LOCAL_UID_SUFFIX = '@smarteverything';

const LOCAL_UID =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@smarteverything$/;

export interface ItemBase {
  readonly profileId: string;
  readonly collectionId: string;
  readonly position: number;
  readonly createdBy: 'person' | 'feed';
}

export type PlannedOverride = PlannerItemInput;

export interface PlannedItem {
  readonly master: PlannerItemInput;
  readonly overrides: readonly PlannedOverride[];
  readonly guests: readonly IcalGuest[];
  readonly completedAt: string | null;
  readonly parentUid: string | null;
}

export function localUidOf(itemId: string): string {
  return `${itemId}${LOCAL_UID_SUFFIX}`;
}

export function itemIdOfLocalUid(uid: string): string | null {
  return LOCAL_UID.exec(uid)?.[1] ?? null;
}

function titled(title: string): string {
  return title.trim() === '' ? NO_TITLE : title.trim();
}

function skeleton(base: ItemBase): PlannerItemInput {
  return {
    profile_id: base.profileId,
    collection_id: base.collectionId,
    kind: 'event',
    parent_id: null,
    title: NO_TITLE,
    notes: '',
    location: null,
    priority: null,
    tags: [],
    estimate_minutes: null,
    start_local: null,
    end_local: null,
    time_zone: null,
    all_day: false,
    due_date: null,
    due_at: null,
    rrule: null,
    exdates: [],
    series_id: null,
    original_start: null,
    start: null,
    end: null,
    series_end: null,
    status: 'open',
    position: base.position,
    completion: { kind: 'manual' },
    attachments: [],
    reminders: [],
    google: null,
    assignee_id: null,
    ical_uid: null,
    ical_sequence: 0,
    booking_page_id: null,
    created_by: base.createdBy,
  };
}

function timedFields(
  timing: IcalTiming | null,
): Pick<PlannerItemInput, 'start_local' | 'end_local' | 'time_zone' | 'all_day'> {
  return {
    start_local: timing?.start ?? null,
    end_local: timing?.end ?? null,
    time_zone: timing?.zone ?? null,
    all_day: timing?.allDay ?? false,
  };
}

function withInstants(input: PlannerItemInput): PlannerItemInput {
  return { ...input, ...instantsOf(input) };
}

function statusOf(entry: IcalEntry): PlannerItemInput['status'] {
  if (entry.cancelled) return 'cancelled';
  return entry.task?.done === true ? 'done' : 'open';
}

function masterInput(entry: IcalEntry, base: ItemBase): PlannerItemInput {
  const task = entry.task;
  const exdates = [
    ...entry.exdates,
    ...entry.overrides.filter((each) => each.content === null).map((each) => each.originalStart),
  ];
  return withInstants({
    ...skeleton(base),
    kind: entry.kind,
    title: titled(entry.title),
    notes: entry.notes,
    location: entry.location,
    ...timedFields(entry.timing),
    priority: task?.priority ?? null,
    due_date: entry.timing === null ? (task?.dueDate ?? null) : null,
    due_at: entry.timing === null ? (task?.dueAt ?? null) : null,
    rrule: entry.rrule,
    exdates: entry.rrule === null ? [] : [...new Set(exdates)].sort(),
    status: statusOf(entry),
    reminders: entry.reminders.map((minutes) => ({ minutes_before: minutes })),
    ical_uid: entry.uid,
    ical_sequence: entry.sequence,
  });
}

function shiftedEnd(master: IcalTiming, start: string): string | null {
  if (master.end === null) return null;
  if (master.allDay) {
    const days = Temporal.PlainDate.from(master.start).until(master.end, {
      largestUnit: 'days',
    }).days;
    return Temporal.PlainDate.from(start).add({ days }).toString();
  }
  const zone = master.zone;
  const length =
    instantOf(master.end, zone).epochMilliseconds - instantOf(master.start, zone).epochMilliseconds;
  return instantOf(start, zone)
    .add({ milliseconds: length })
    .toZonedDateTimeISO(zone ?? 'UTC')
    .toPlainDateTime()
    .toString({ smallestUnit: 'second' });
}

function overrideTiming(
  master: IcalTiming,
  override: IcalOverride,
  content: IcalContent,
): IcalTiming {
  return (
    content.timing ?? {
      ...master,
      start: override.originalStart,
      end: shiftedEnd(master, override.originalStart),
    }
  );
}

function overrideInput(
  entry: IcalEntry,
  master: IcalTiming,
  override: IcalOverride,
  base: ItemBase,
): PlannedOverride | null {
  const content = override.content;
  if (content === null) return null;
  const timing = overrideTiming(master, override, content);
  return withInstants({
    ...skeleton(base),
    title: titled(content.title === '' ? entry.title : content.title),
    notes: content.notes === '' ? entry.notes : content.notes,
    location: content.location ?? entry.location,
    ...timedFields(timing),
    original_start: override.originalStart,
    reminders: entry.reminders.map((minutes) => ({ minutes_before: minutes })),
    ical_uid: entry.uid,
    ical_sequence: override.sequence,
  });
}

function extraOccurrences(entry: IcalEntry): readonly IcalOverride[] {
  const moved = new Set(entry.overrides.map((override) => override.originalStart));
  return [...new Set(entry.extraDates)]
    .filter((date) => !moved.has(date))
    .map((date) => ({
      originalStart: date,
      content: { title: entry.title, notes: entry.notes, location: entry.location, timing: null },
      sequence: entry.sequence,
    }));
}

export function plannedItemOf(entry: IcalEntry, base: ItemBase): PlannedItem {
  const timing = entry.timing;
  const overrides =
    timing === null
      ? []
      : [...entry.overrides, ...extraOccurrences(entry)].flatMap(
          (each) => overrideInput(entry, timing, each, base) ?? [],
        );
  return {
    master: masterInput(entry, base),
    overrides,
    guests: entry.kind === 'event' ? entry.guests : [],
    completedAt: entry.task?.completedAt ?? null,
    parentUid: entry.parentUid,
  };
}

function timingOfRow(row: PlannerItemRow): IcalTiming | null {
  if (row.start_local === null) return null;
  return {
    start: row.start_local,
    end: row.end_local,
    zone: row.time_zone,
    allDay: row.all_day,
  };
}

function contentOfRow(row: PlannerItemRow): IcalContent {
  return {
    title: row.title,
    notes: row.notes,
    location: row.location,
    timing: timingOfRow(row),
  };
}

function guestOfRow(row: PlannerGuestRow): IcalGuest[] {
  return row.email === null ? [] : [{ email: row.email, name: row.name, response: row.response }];
}

function priorityText(row: PlannerItemRow): 1 | 2 | 3 | null {
  return row.priority === 1 || row.priority === 2 || row.priority === 3 ? row.priority : null;
}

export interface EntryRows {
  readonly master: PlannerItemRow;
  readonly parentUid: string | null;
  readonly overrides: readonly PlannerItemRow[];
  readonly guests: readonly PlannerGuestRow[];
  readonly completedAt: string | null;
}

export function entryOfRows(rows: EntryRows): IcalEntry {
  const { master } = rows;
  const live = rows.overrides.filter((row) => row.status !== 'cancelled');
  const task =
    master.kind === 'task'
      ? {
          dueDate: master.due_date,
          dueAt: master.due_at,
          priority: priorityText(master),
          done: master.status === 'done',
          completedAt: rows.completedAt,
        }
      : null;
  return {
    ...contentOfRow(master),
    kind: master.kind,
    uid: master.ical_uid ?? localUidOf(master.id),
    sequence: master.ical_sequence,
    rrule: master.rrule,
    exdates: master.exdates,
    extraDates: [],
    reminders: master.reminders.map((reminder) => reminder.minutes_before),
    guests: rows.guests.flatMap(guestOfRow),
    overrides: live.flatMap((row) =>
      row.original_start === null
        ? []
        : [
            {
              originalStart: row.original_start,
              content: contentOfRow(row),
              sequence: row.ical_sequence,
            },
          ],
    ),
    task,
    cancelled: master.status === 'cancelled',
    parentUid: rows.parentUid,
  };
}
