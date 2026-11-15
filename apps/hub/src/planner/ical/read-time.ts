import { parsePlannerRrule } from '@smarteverything/domain';
import ICAL from 'ical.js';
import { instantOf } from '../instants';
import type { IcalTiming, IcalUnsupported } from './model';
import { durationSecondsOf, parameterOf, periodStartsOf, recurOf, timeOf, timesOf } from './values';
import type { ZoneBook } from './zones';

const WHOLE_DAY_SECONDS = 86_400;

export interface Moment {
  readonly allDay: boolean;
  readonly local: string;
  readonly zone: string | null;
}

export interface ReadContext {
  readonly book: ZoneBook;
  readonly defaultZone: string;
  readonly unsupported: IcalUnsupported[];
}

function localOf(instant: Temporal.Instant, zone: string): string {
  return instant.toZonedDateTimeISO(zone).toPlainDateTime().toString({ smallestUnit: 'second' });
}

function note(context: ReadContext, entry: IcalUnsupported): void {
  const last = context.unsupported.at(-1);
  if (last?.part === entry.part && last.detail === entry.detail) return;
  context.unsupported.push(entry);
}

function viaRules(time: ICAL.Time, zone: ICAL.Timezone, context: ReadContext): Moment {
  const floating = ICAL.Time.fromDateTimeString(time.toString());
  floating.zone = zone;
  note(context, {
    part: 'timezone',
    detail: `The time zone "${zone.tzid}" has no standard name, so its times were converted to UTC`,
  });
  const instant = Temporal.Instant.fromEpochMilliseconds(floating.toUnixTime() * 1000);
  return { allDay: false, local: localOf(instant, 'UTC'), zone: 'UTC' };
}

function zonedMoment(time: ICAL.Time, tzid: string, context: ReadContext): Moment {
  const resolved = context.book.resolve(tzid);
  if (resolved?.kind === 'iana') {
    return { allDay: false, local: time.toString(), zone: resolved.zone };
  }
  if (resolved?.kind === 'rules') return viaRules(time, resolved.zone, context);
  note(context, {
    part: 'timezone',
    detail: `The time zone "${tzid}" is not known, so its times were read in ${context.defaultZone}`,
  });
  return { allDay: false, local: time.toString(), zone: context.defaultZone };
}

export function momentOf(
  property: ICAL.Property | null,
  context: ReadContext,
  keepUtc: boolean,
): Moment | null {
  const time = timeOf(property);
  if (property === null || time === null) return null;
  if (time.isDate) return { allDay: true, local: time.toString(), zone: null };
  const text = time.toString();
  if (text.endsWith('Z')) {
    const utc = { allDay: false, local: text.slice(0, -1), zone: 'UTC' };
    return keepUtc ? utc : inZone(utc, context.defaultZone);
  }
  const tzid = parameterOf(property, 'tzid');
  if (tzid === null) return { allDay: false, local: text, zone: context.defaultZone };
  return zonedMoment(time, tzid, context);
}

export function instantOfMoment(moment: Moment): Temporal.Instant {
  return instantOf(moment.local, moment.zone);
}

export function inZone(moment: Moment, zone: string): Moment {
  if (moment.allDay || moment.zone === zone) return moment;
  return { allDay: false, local: localOf(instantOfMoment(moment), zone), zone };
}

function dayAfter(date: string, days: number): string {
  return Temporal.PlainDate.from(date).add({ days }).toString();
}

function allDayTiming(
  start: Moment,
  end: Moment | null,
  seconds: number | null,
): IcalTiming | null {
  const exclusive =
    end?.allDay === true
      ? end.local
      : dayAfter(
          start.local,
          Math.max(1, Math.ceil((seconds ?? WHOLE_DAY_SECONDS) / WHOLE_DAY_SECONDS)),
        );
  const last = dayAfter(exclusive, -1);
  return {
    start: start.local,
    end: last > start.local ? last : null,
    zone: null,
    allDay: true,
  };
}

function timedTiming(
  start: Moment,
  end: Moment | null,
  seconds: number | null,
  context: ReadContext,
): IcalTiming {
  const zone = start.zone ?? context.defaultZone;
  let endLocal: string | null = null;
  if (end !== null && !end.allDay) {
    endLocal = inZone(end, zone).local;
  } else if (seconds !== null) {
    endLocal = localOf(instantOfMoment(start).add({ seconds }), zone);
  }
  const ordered = endLocal !== null && endLocal >= start.local ? endLocal : null;
  if (endLocal !== null && ordered === null) {
    context.unsupported.push({ part: 'property', detail: 'DTEND before DTSTART' });
  }
  return { start: start.local, end: ordered, zone, allDay: false };
}

export function timingOf(
  component: ICAL.Component,
  context: ReadContext,
  recurring: boolean,
): IcalTiming | null {
  const start = momentOf(component.getFirstProperty('dtstart'), context, recurring);
  if (start === null) return null;
  const endName = component.name === 'vtodo' ? 'due' : 'dtend';
  const end = momentOf(component.getFirstProperty(endName), context, recurring);
  const seconds = durationSecondsOf(component.getFirstProperty('duration'));
  return start.allDay
    ? allDayTiming(start, end, seconds)
    : timedTiming(start, end, seconds, context);
}

function untilOf(rule: string, allDay: boolean): string {
  return rule.replace(
    /(^|;)UNTIL=(\d{8})(T\d{6}Z?)?/,
    (_all, lead: string, date: string, time: string | undefined) => {
      if (allDay) return `${lead}UNTIL=${date}`;
      return `${lead}UNTIL=${date}${time ?? 'T235959'}`;
    },
  );
}

export function ruleOf(
  component: ICAL.Component,
  allDay: boolean,
  context: ReadContext,
): string | null {
  const recur = recurOf(component);
  if (component.getFirstProperty('exrule') !== null) {
    context.unsupported.push({ part: 'recurrence', detail: 'EXRULE' });
  }
  if (recur === null) return null;
  const text = untilOf(recur.toString(), allDay);
  const parsed = parsePlannerRrule(text);
  if (parsed.success) return text;
  context.unsupported.push({ part: 'recurrence', detail: `${text}: ${parsed.message}` });
  return null;
}

function exdateLocal(
  time: ICAL.Time,
  tzid: string | null,
  timing: IcalTiming,
  context: ReadContext,
): string {
  if (timing.allDay) return time.toString().slice(0, 10);
  if (time.isDate) return `${time.toString()}${timing.start.slice(10)}`;
  const text = time.toString();
  const moment: Moment = text.endsWith('Z')
    ? { allDay: false, local: text.slice(0, -1), zone: 'UTC' }
    : zonedOrDefault(time, tzid, context);
  return inZone(moment, timing.zone ?? context.defaultZone).local;
}

function zonedOrDefault(time: ICAL.Time, tzid: string | null, context: ReadContext): Moment {
  if (tzid === null) return { allDay: false, local: time.toString(), zone: context.defaultZone };
  return zonedMoment(time, tzid, context);
}

export function datesOf(
  component: ICAL.Component,
  name: 'exdate' | 'rdate',
  timing: IcalTiming,
  context: ReadContext,
): readonly string[] {
  return component.getAllProperties(name).flatMap((property) => {
    const tzid = parameterOf(property, 'tzid');
    const times = [...timesOf(property), ...periodStartsOf(property)];
    return times.map((time) => exdateLocal(time, tzid, timing, context));
  });
}
