import { localClock, shiftedDate, zonedInstant } from '@smarteverything/domain';
import type { CalendarDate } from '@smarteverything/domain';
import { WEEKDAYS } from './logic';
import { clockOf, instantOf, isoOf } from './moments';
import type { JsonList, PureBodies, PureBody } from './support';
import { fail, isText, mismatch } from './support';

const MONDAY_OFFSET = 6;
const DAYS_IN_WEEK = 7;

function startDate(unit: string, clock: ReturnType<typeof localClock>): CalendarDate {
  const { year, month, day } = clock;
  if (unit === 'day') return { year, month, day };
  if (unit === 'week') return shiftedDate(clock, -((clock.weekday + MONDAY_OFFSET) % DAYS_IN_WEEK));
  if (unit === 'month') return { year, month, day: 1 };
  if (unit === 'year') return { year, month: 1, day: 1 };
  return fail('Invalid', `${unit} is not a part of the calendar`);
}

function nextStart(unit: string, start: CalendarDate): CalendarDate {
  if (unit === 'day') return shiftedDate(start, 1);
  if (unit === 'week') return shiftedDate(start, DAYS_IN_WEEK);
  if (unit === 'month') {
    return start.month === 12
      ? { year: start.year + 1, month: 1, day: 1 }
      : { year: start.year, month: start.month + 1, day: 1 };
  }
  return { year: start.year + 1, month: 1, day: 1 };
}

const startOf: PureBody = (ports, environment) => {
  const clock = localClock(
    new Date(instantOf(ports.need('instant'), 'instant')),
    environment.timeZone,
  );
  const unit = ports.text('unit');
  const start = startDate(unit, clock);
  const edge = ports.text('edge');
  if (edge === 'start') {
    return { instant: isoOf(zonedInstant(start, 0, environment.timeZone).getTime()) };
  }
  if (edge !== 'end') return fail('Invalid', `${edge} is not start or end`);
  const following = zonedInstant(nextStart(unit, start), 0, environment.timeZone).getTime();
  return { instant: isoOf(following - 1) };
};

function weekdaysOf(days: JsonList): readonly string[] {
  return days.map((day) =>
    isText(day) && WEEKDAYS.includes(day)
      ? day
      : mismatch('days', 'weekdays such as mon or sat', day),
  );
}

const next: PureBody = (ports, environment) => {
  const minute = clockOf(ports.need('clock'), 'clock');
  const days = weekdaysOf(ports.list('days'));
  const given = ports.maybeText('after');
  const after = given === undefined ? environment.now() : instantOf(given, 'after');
  const clock = localClock(new Date(after), environment.timeZone);
  for (let offset = 0; offset <= DAYS_IN_WEEK; offset += 1) {
    const date = shiftedDate(clock, offset);
    const allowed = days.length === 0 || days.includes(WEEKDAYS[date.weekday] ?? '');
    const candidate = zonedInstant(date, minute, environment.timeZone).getTime();
    if (allowed && candidate > after) return { instant: isoOf(candidate) };
  }
  return fail('NotFound', 'no day in the next week matches');
};

export const DATE_MORE_BODIES: PureBodies = {
  'date.start_of': startOf,
  'date.next': next,
};
