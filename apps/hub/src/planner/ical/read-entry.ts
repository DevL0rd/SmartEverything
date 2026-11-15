import type { PlannerGuestResponse } from '@smarteverything/domain';
import { createHash } from 'node:crypto';
import ICAL from 'ical.js';
import { z } from 'zod';
import type {
  IcalContent,
  IcalEntry,
  IcalGuest,
  IcalOverride,
  IcalTaskFields,
  IcalTiming,
} from './model';
import { isoOf } from '../instants';
import {
  datesOf,
  inZone,
  instantOfMoment,
  momentOf,
  ruleOf,
  timingOf,
  type ReadContext,
} from './read-time';
import { numberOf, parameterOf, textOf, timeOf } from './values';

const EMAIL = z.email();
const SECONDS_PER_MINUTE = 60;

const HANDLED: ReadonlySet<string> = new Set([
  'uid',
  'summary',
  'description',
  'location',
  'dtstart',
  'dtend',
  'due',
  'duration',
  'rrule',
  'exrule',
  'exdate',
  'rdate',
  'recurrence-id',
  'related-to',
  'attendee',
  'status',
  'priority',
  'completed',
  'sequence',
  'dtstamp',
  'created',
  'last-modified',
]);

const PARTSTAT: Readonly<Record<string, PlannerGuestResponse>> = {
  ACCEPTED: 'yes',
  DECLINED: 'no',
  TENTATIVE: 'maybe',
};

const ORDINARY_GUEST = new Set(['', 'INDIVIDUAL', 'GROUP', 'UNKNOWN']);

function noteExtras(component: ICAL.Component, context: ReadContext): void {
  for (const property of component.getAllProperties()) {
    if (HANDLED.has(property.name)) continue;
    const detail = property.name.toUpperCase();
    if (property.name === 'attach') context.unsupported.push({ part: 'attachment', detail });
    else if (property.name === 'organizer') context.unsupported.push({ part: 'attendee', detail });
    else context.unsupported.push({ part: 'property', detail });
  }
}

function guestOf(property: ICAL.Property, context: ReadContext): IcalGuest | null {
  const value: unknown = property.getFirstValue();
  const address = typeof value === 'string' ? value.replace(/^mailto:/i, '').trim() : '';
  const kind = (parameterOf(property, 'cutype') ?? '').toUpperCase();
  if (!EMAIL.safeParse(address).success || !ORDINARY_GUEST.has(kind)) {
    context.unsupported.push({ part: 'attendee', detail: 'ATTENDEE without a person email' });
    return null;
  }
  const name = parameterOf(property, 'cn');
  const stat = (parameterOf(property, 'partstat') ?? '').toUpperCase();
  return {
    email: address.toLowerCase(),
    name: name === null || name.trim() === '' ? null : name.trim(),
    response: PARTSTAT[stat] ?? 'needs_action',
  };
}

function guestsOf(component: ICAL.Component, context: ReadContext): readonly IcalGuest[] {
  const guests = component
    .getAllProperties('attendee')
    .flatMap((property) => guestOf(property, context) ?? []);
  return [...new Map(guests.map((guest) => [guest.email, guest])).values()];
}

function lengthSeconds(timing: IcalTiming | null, context: ReadContext): number {
  if (timing === null) return 0;
  if (timing.allDay) {
    const last = timing.end ?? timing.start;
    return (
      (Temporal.PlainDate.from(timing.start).until(last, { largestUnit: 'days' }).days + 1) * 86_400
    );
  }
  if (timing.end === null) return 0;
  const zone = timing.zone ?? context.defaultZone;
  const start = instantOfMoment({ allDay: false, local: timing.start, zone });
  const end = instantOfMoment({ allDay: false, local: timing.end, zone });
  return Math.round((end.epochMilliseconds - start.epochMilliseconds) / 1000);
}

function triggerSeconds(
  alarm: ICAL.Component,
  length: number,
  context: ReadContext,
): number | null {
  const property = alarm.getFirstProperty('trigger');
  const value: unknown = property?.getFirstValue();
  if (!(value instanceof ICAL.Duration)) {
    context.unsupported.push({ part: 'alarm', detail: 'an alarm at a fixed time' });
    return null;
  }
  const related = (property === null ? null : parameterOf(property, 'related')) ?? 'START';
  const fromStart = value.toSeconds() + (related.toUpperCase() === 'END' ? length : 0);
  if (fromStart > 0) {
    context.unsupported.push({ part: 'alarm', detail: 'an alarm after the start' });
    return null;
  }
  return -fromStart;
}

function remindersOf(
  component: ICAL.Component,
  timing: IcalTiming | null,
  context: ReadContext,
): readonly number[] {
  const length = lengthSeconds(timing, context);
  const minutes = component
    .getAllSubcomponents('valarm')
    .flatMap((alarm) => triggerSeconds(alarm, length, context) ?? [])
    .map((seconds) => Math.round(seconds / SECONDS_PER_MINUTE));
  return [...new Set(minutes)].sort((left, right) => left - right);
}

function contentOf(
  component: ICAL.Component,
  context: ReadContext,
  recurring: boolean,
): IcalContent {
  return {
    title: (textOf(component, 'summary') ?? '').trim(),
    notes: textOf(component, 'description') ?? '',
    location: (textOf(component, 'location') ?? '').trim() || null,
    timing: timingOf(component, context, recurring),
  };
}

function priorityOf(component: ICAL.Component): 1 | 2 | 3 | null {
  const value = numberOf(component, 'priority');
  if (value === null || value < 1 || value > 9) return null;
  if (value <= 3) return 1;
  return value <= 6 ? 2 : 3;
}

function taskFieldsOf(component: ICAL.Component, context: ReadContext): IcalTaskFields {
  const status = (textOf(component, 'status') ?? '').toUpperCase();
  const completed = timeOf(component.getFirstProperty('completed'));
  const due = momentOf(component.getFirstProperty('due'), context, false);
  const done = status === 'COMPLETED' || completed !== null;
  return {
    dueDate: due?.allDay === true ? due.local : null,
    dueAt: due === null || due.allDay ? null : isoOf(instantOfMoment(due)),
    priority: priorityOf(component),
    done,
    completedAt: completed === null ? null : completedInstant(completed),
  };
}

function completedInstant(time: ICAL.Time): string {
  return isoOf(Temporal.Instant.fromEpochMilliseconds(time.toUnixTime() * 1000));
}

function parentOf(component: ICAL.Component, context: ReadContext): string | null {
  const parents = component.getAllProperties('related-to').flatMap((property) => {
    const kind = (parameterOf(property, 'reltype') ?? 'PARENT').toUpperCase();
    const value: unknown = property.getFirstValue();
    if (kind === 'PARENT' && typeof value === 'string' && value.trim() !== '')
      return [value.trim()];
    context.unsupported.push({ part: 'property', detail: `RELATED-TO;RELTYPE=${kind}` });
    return [];
  });
  return parents[0] ?? null;
}

function uidOf(component: ICAL.Component, content: IcalContent): string {
  const given = textOf(component, 'uid');
  if (given !== null && given.trim() !== '') return given.trim();
  const basis = `${content.title}\u0000${content.timing?.start ?? ''}`;
  return `${createHash('sha256').update(basis).digest('hex').slice(0, 32)}@imported`;
}

function isCancelled(component: ICAL.Component): boolean {
  return (textOf(component, 'status') ?? '').toUpperCase() === 'CANCELLED';
}

function slotOf(property: ICAL.Property, master: IcalTiming, context: ReadContext): string | null {
  const moment = momentOf(property, context, master.zone === 'UTC');
  if (moment === null) return null;
  if ((parameterOf(property, 'range') ?? '').toUpperCase() === 'THISANDFUTURE') {
    context.unsupported.push({ part: 'recurrence', detail: 'RANGE=THISANDFUTURE' });
  }
  return master.allDay
    ? moment.local.slice(0, 10)
    : inZone(moment, master.zone ?? context.defaultZone).local;
}

function overrideOf(
  component: ICAL.Component,
  master: IcalTiming | null,
  context: ReadContext,
): IcalOverride | null {
  const property = component.getFirstProperty('recurrence-id');
  if (property === null || master === null) return null;
  const originalStart = slotOf(property, master, context);
  if (originalStart === null) return null;
  noteExtras(component, context);
  return {
    originalStart,
    content: isCancelled(component) ? null : contentOf(component, context, false),
    sequence: numberOf(component, 'sequence') ?? 0,
  };
}

function repeatsOf(
  component: ICAL.Component,
  timing: IcalTiming | null,
  context: ReadContext,
): {
  readonly rrule: string | null;
  readonly exdates: readonly string[];
  readonly extraDates: readonly string[];
} {
  const rrule = timing === null ? null : ruleOf(component, timing.allDay, context);
  if (rrule === null || timing === null) return { rrule: null, exdates: [], extraDates: [] };
  return {
    rrule,
    exdates: datesOf(component, 'exdate', timing, context),
    extraDates: datesOf(component, 'rdate', timing, context),
  };
}

function noteEventPriority(component: ICAL.Component, context: ReadContext): void {
  if (component.name !== 'vtodo' && component.getFirstProperty('priority') !== null) {
    context.unsupported.push({ part: 'property', detail: 'PRIORITY on an event' });
  }
}

export function entryOf(
  component: ICAL.Component,
  overrides: readonly ICAL.Component[],
  context: ReadContext,
): IcalEntry | null {
  const content = contentOf(component, context, component.getFirstProperty('rrule') !== null);
  const task = component.name === 'vtodo' ? taskFieldsOf(component, context) : null;
  if (content.timing === null && task === null) {
    context.unsupported.push({ part: 'component', detail: 'an event without a start' });
    return null;
  }
  noteExtras(component, context);
  noteEventPriority(component, context);
  const repeats = repeatsOf(component, content.timing, context);
  return {
    ...content,
    ...repeats,
    kind: task === null ? 'event' : 'task',
    uid: uidOf(component, content),
    sequence: numberOf(component, 'sequence') ?? 0,
    reminders: remindersOf(component, content.timing, context),
    guests: guestsOf(component, context),
    overrides:
      repeats.rrule === null
        ? []
        : overrides.flatMap((each) => overrideOf(each, content.timing, context) ?? []),
    task,
    cancelled: isCancelled(component),
    parentUid: parentOf(component, context),
  };
}
