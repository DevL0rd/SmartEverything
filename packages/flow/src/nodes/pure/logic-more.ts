import { localClock } from '@smarteverything/domain';
import type { JsonValue } from '@smarteverything/domain';
import { WEEKDAYS, flags } from './logic';
import { clockOf, instantOf } from './moments';
import type { Ports, PureBodies, PureBody, PureEnvironment } from './support';
import { fail, isList, isRecord, isText, mismatch, outputs } from './support';

const xor: PureBody = (ports) => ({
  result: flags(ports.list('flags')).filter(Boolean).length === 1,
});

const countTrue: PureBody = (ports) => {
  const count = flags(ports.list('flags')).filter(Boolean).length;
  const atLeast = ports.number('atLeast');
  const atMost = ports.maybeNumber('atMost');
  return { result: count >= atLeast && (atMost === undefined || count <= atMost), count };
};

const DATE_TEXT = /^(\d{4})-(\d{2})-(\d{2})$/;

function calendarDate(value: JsonValue): string {
  if (!isText(value)) return mismatch('a listed date', 'a date as YYYY-MM-DD', value);
  const match = DATE_TEXT.exec(value);
  if (match === null) return mismatch('a listed date', 'a date as YYYY-MM-DD', value);
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const real = new Date(Date.UTC(year, month - 1, day));
  if (real.getUTCMonth() !== month - 1 || real.getUTCDate() !== day) {
    return fail('Invalid', `${value} is not a day on the calendar`);
  }
  return value;
}

function momentOf(ports: Ports, name: string, environment: PureEnvironment): number {
  const at = ports.maybeText(name);
  return at === undefined ? environment.now() : instantOf(at, name);
}

const dayType: PureBody = (ports, environment) => {
  const clock = localClock(new Date(momentOf(ports, 'date', environment)), environment.timeZone);
  const weekend = clock.weekday === 0 || clock.weekday === 6;
  const is = ports.text('is');
  if (is === 'weekday') return { result: !weekend };
  if (is === 'weekend') return { result: weekend };
  if (is !== 'listed') return fail('Invalid', `${is} is not a type of day`);
  const today = `${String(clock.year).padStart(4, '0')}-${String(clock.month).padStart(2, '0')}-${String(clock.day).padStart(2, '0')}`;
  return { result: ports.list('dates').map(calendarDate).includes(today) };
};

interface Slot {
  readonly days: readonly string[];
  readonly from: number;
  readonly to: number;
}

function slotOf(value: JsonValue, position: number): Slot {
  const label = `slot ${String(position + 1)}`;
  if (!isRecord(value)) return mismatch(label, 'a record with days, from and to', value);
  const days = value['days'] ?? [];
  if (!isList(days)) return mismatch(`${label} days`, 'a list of weekdays', days);
  for (const day of days) {
    if (!isText(day) || !WEEKDAYS.includes(day)) {
      return mismatch(`${label} days`, 'weekdays such as mon or sat', day);
    }
  }
  return {
    days: days.map(String),
    from: clockOf(value['from'], `${label} from`),
    to: clockOf(value['to'], `${label} to`),
  };
}

function runsOn(slot: Slot, weekday: number): boolean {
  return slot.days.length === 0 || slot.days.includes(WEEKDAYS[weekday] ?? '');
}

function holds(slot: Slot, weekday: number, minute: number): boolean {
  if (slot.from === slot.to) return false;
  if (slot.from < slot.to) return runsOn(slot, weekday) && minute >= slot.from && minute < slot.to;
  const lateToday = runsOn(slot, weekday) && minute >= slot.from;
  const earlyFromYesterday = runsOn(slot, (weekday + 6) % 7) && minute < slot.to;
  return lateToday || earlyFromYesterday;
}

const inSchedule: PureBody = (ports, environment) => {
  const clock = localClock(new Date(momentOf(ports, 'at', environment)), environment.timeZone);
  const slots = ports.list('slots').map(slotOf);
  const found = slots.findIndex((slot) => holds(slot, clock.weekday, clock.minuteOfDay));
  return outputs({ result: found >= 0, slot: found >= 0 ? found : undefined });
};

export const LOGIC_MORE_BODIES: PureBodies = {
  'logic.xor': xor,
  'logic.count_true': countTrue,
  'logic.day_type': dayType,
  'logic.in_schedule': inSchedule,
};
