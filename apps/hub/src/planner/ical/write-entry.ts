import ICAL from 'ical.js';
import type { IcalContent, IcalEntry, IcalGuest, IcalOverride } from './model';

const RESPONSE_PARTSTAT = {
  needs_action: 'NEEDS-ACTION',
  yes: 'ACCEPTED',
  no: 'DECLINED',
  maybe: 'TENTATIVE',
} as const;

const TASK_PRIORITY = { 1: 1, 2: 5, 3: 9 } as const;

export interface WriteContext {
  readonly stamp: ICAL.Time;
  readonly zones: Map<string, number>;
}

function withSeconds(local: string): string {
  return local.length === 16 ? `${local}:00` : local;
}

function noteZone(context: WriteContext, zone: string, local: string): void {
  const year = Number(local.slice(0, 4));
  const known = context.zones.get(zone);
  if (known === undefined || year < known) context.zones.set(zone, year);
}

function timeValue(local: string, allDay: boolean, utc: boolean): ICAL.Time {
  if (allDay) return ICAL.Time.fromDateString(local.slice(0, 10));
  return ICAL.Time.fromDateTimeString(`${withSeconds(local)}${utc ? 'Z' : ''}`);
}

export function timeProperty(
  name: string,
  local: string,
  zone: string | null,
  context: WriteContext,
): ICAL.Property {
  const property = new ICAL.Property(name);
  const utc = zone === 'UTC';
  property.setValue(timeValue(local, zone === null, utc));
  if (zone !== null && !utc) {
    property.setParameter('tzid', zone);
    noteZone(context, zone, local);
  }
  return property;
}

function datesProperty(
  name: string,
  values: readonly string[],
  zone: string | null,
  context: WriteContext,
): ICAL.Property {
  const property = new ICAL.Property(name);
  const utc = zone === 'UTC';
  property.setValues(values.map((value) => timeValue(value, zone === null, utc)));
  if (zone !== null && !utc) {
    property.setParameter('tzid', zone);
    for (const value of values) noteZone(context, zone, value);
  }
  return property;
}

function addTiming(
  component: ICAL.Component,
  content: IcalContent,
  entry: Pick<IcalEntry, 'kind'>,
  context: WriteContext,
): void {
  const timing = content.timing;
  if (timing === null) return;
  component.addProperty(timeProperty('dtstart', timing.start, timing.zone, context));
  const endName = entry.kind === 'task' ? 'due' : 'dtend';
  if (timing.allDay) {
    const last = Temporal.PlainDate.from(timing.end ?? timing.start)
      .add({ days: 1 })
      .toString();
    component.addProperty(timeProperty(endName, last, null, context));
  } else if (timing.end !== null) {
    component.addProperty(timeProperty(endName, timing.end, timing.zone, context));
  }
}

function addText(component: ICAL.Component, content: IcalContent): void {
  component.addPropertyWithValue('summary', content.title);
  if (content.notes !== '') component.addPropertyWithValue('description', content.notes);
  if (content.location !== null) component.addPropertyWithValue('location', content.location);
}

function guestProperty(guest: IcalGuest): ICAL.Property {
  const property = new ICAL.Property('attendee');
  property.setValue(`mailto:${guest.email}`);
  if (guest.name !== null) property.setParameter('cn', guest.name);
  property.setParameter('partstat', RESPONSE_PARTSTAT[guest.response]);
  if (guest.response === 'needs_action') property.setParameter('rsvp', 'TRUE');
  return property;
}

function addReminders(component: ICAL.Component, entry: IcalEntry): void {
  for (const minutes of entry.reminders) {
    const alarm = new ICAL.Component('valarm');
    alarm.addPropertyWithValue('action', 'DISPLAY');
    alarm.addPropertyWithValue('description', entry.title);
    alarm.addPropertyWithValue('trigger', ICAL.Duration.fromSeconds(-minutes * 60));
    component.addSubcomponent(alarm);
  }
}

function addIdentity(component: ICAL.Component, entry: IcalEntry, context: WriteContext): void {
  component.addPropertyWithValue('uid', entry.uid);
  component.addPropertyWithValue('dtstamp', context.stamp);
  component.addPropertyWithValue('sequence', entry.sequence);
}

function addRecurrence(component: ICAL.Component, entry: IcalEntry, context: WriteContext): void {
  if (entry.rrule === null || entry.timing === null) return;
  component.addPropertyWithValue('rrule', ICAL.Recur.fromString(entry.rrule));
  const { zone } = entry.timing;
  if (entry.exdates.length > 0) {
    component.addProperty(datesProperty('exdate', entry.exdates, zone, context));
  }
}

function addTask(component: ICAL.Component, entry: IcalEntry, context: WriteContext): void {
  const { task } = entry;
  if (task === null) return;
  if (entry.timing === null && task.dueDate !== null) {
    component.addProperty(timeProperty('due', task.dueDate, null, context));
  }
  if (entry.timing === null && task.dueAt !== null) {
    const utc = Temporal.Instant.from(task.dueAt).toZonedDateTimeISO('UTC').toPlainDateTime();
    component.addProperty(
      timeProperty('due', utc.toString({ smallestUnit: 'second' }), 'UTC', context),
    );
  }
  if (task.priority !== null)
    component.addPropertyWithValue('priority', TASK_PRIORITY[task.priority]);
  if (task.done) {
    component.addPropertyWithValue('status', 'COMPLETED');
    if (task.completedAt !== null) {
      const done = Temporal.Instant.from(task.completedAt)
        .toZonedDateTimeISO('UTC')
        .toPlainDateTime();
      component.addProperty(
        timeProperty('completed', done.toString({ smallestUnit: 'second' }), 'UTC', context),
      );
    }
  }
}

function entryComponent(entry: IcalEntry, context: WriteContext): ICAL.Component {
  const component = new ICAL.Component(entry.kind === 'task' ? 'vtodo' : 'vevent');
  addIdentity(component, entry, context);
  addText(component, entry);
  addTiming(component, entry, entry, context);
  addRecurrence(component, entry, context);
  addTask(component, entry, context);
  if (entry.cancelled) component.addPropertyWithValue('status', 'CANCELLED');
  if (entry.parentUid !== null) component.addPropertyWithValue('related-to', entry.parentUid);
  for (const guest of entry.guests) component.addProperty(guestProperty(guest));
  addReminders(component, entry);
  return component;
}

function overrideComponent(
  entry: IcalEntry,
  override: IcalOverride,
  context: WriteContext,
): ICAL.Component | null {
  const { content, originalStart } = override;
  if (content === null || entry.timing === null) return null;
  const component = new ICAL.Component('vevent');
  component.addPropertyWithValue('uid', entry.uid);
  component.addPropertyWithValue('dtstamp', context.stamp);
  component.addPropertyWithValue('sequence', override.sequence);
  component.addProperty(timeProperty('recurrence-id', originalStart, entry.timing.zone, context));
  addText(component, content);
  addTiming(component, content, { kind: 'event' }, context);
  addReminders(component, { ...entry, title: content.title });
  return component;
}

export function entryComponents(entry: IcalEntry, context: WriteContext): ICAL.Component[] {
  return [
    entryComponent(entry, context),
    ...entry.overrides.flatMap((override) => overrideComponent(entry, override, context) ?? []),
  ];
}
