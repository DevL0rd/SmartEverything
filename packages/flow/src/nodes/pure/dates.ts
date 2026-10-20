import { localClock, shiftedDate, zonedInstant } from '@smarteverything/domain';
import {
  DAY,
  DAY_MINUTES,
  HOUR,
  MINUTE,
  clockText,
  instantOf,
  isInstantText,
  isoOf,
} from './moments';
import type { PureBodies, PureBody } from './support';
import { fail, finite, outputs, reasonOf } from './support';

const DEFAULT_LOCALE = 'en-GB';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TOKENS = /yyyy|MMM|MM|dd|HH|mm|ss|EEE/g;
const LOCAL_FORMATS = ['yyyy-MM-ddTHH:mm:ss', 'yyyy-MM-ddTHH:mm', 'yyyy-MM-dd'];

const PRESETS: Readonly<Record<string, Intl.DateTimeFormatOptions>> = {
  short: { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' },
  long: {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  },
  time: { hour: '2-digit', minute: '2-digit' },
  date: { day: 'numeric', month: 'short', year: 'numeric' },
  speakable: {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  },
};

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

function secondsOf(milliseconds: number): number {
  return Math.floor((((milliseconds % MINUTE) + MINUTE) % MINUTE) / 1000);
}

function validZone(zone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: zone }).resolvedOptions().timeZone;
  } catch (error) {
    return fail('Invalid', `${zone} is not a time zone (${reasonOf(error)})`);
  }
}

function patternValue(token: string, milliseconds: number, zone: string): string {
  const clock = localClock(new Date(milliseconds), zone);
  const table: Record<string, string> = {
    yyyy: pad(clock.year, 4),
    MMM: MONTHS[clock.month - 1] ?? '',
    MM: pad(clock.month),
    dd: pad(clock.day),
    HH: pad(Math.floor(clock.minuteOfDay / 60)),
    mm: pad(clock.minuteOfDay % 60),
    ss: pad(secondsOf(milliseconds)),
    EEE: WEEKDAY_NAMES[clock.weekday] ?? '',
  };
  return table[token] ?? token;
}

function intlFormat(milliseconds: number, zone: string, locale: string, preset: string): string {
  const options = PRESETS[preset] ?? fail('Invalid', `${preset} is not a date format`);
  try {
    return new Intl.DateTimeFormat(locale, { timeZone: zone, hourCycle: 'h23', ...options }).format(
      milliseconds,
    );
  } catch (error) {
    return fail('Invalid', `${locale} is not a locale (${reasonOf(error)})`);
  }
}

function relativeUnit(difference: number): [number, Intl.RelativeTimeFormatUnit] {
  const size = Math.abs(difference);
  if (size < MINUTE) return [Math.round(difference / 1000), 'second'];
  if (size < HOUR) return [Math.round(difference / MINUTE), 'minute'];
  if (size < DAY) return [Math.round(difference / HOUR), 'hour'];
  return [Math.round(difference / DAY), 'day'];
}

function relative(milliseconds: number, now: number, locale: string): string {
  const [amount, unit] = relativeUnit(milliseconds - now);
  try {
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(amount, unit);
  } catch (error) {
    return fail('Invalid', `${locale} is not a locale (${reasonOf(error)})`);
  }
}

const format: PureBody = (ports, environment) => {
  const milliseconds = instantOf(ports.need('instant'), 'instant');
  const preset = ports.text('preset');
  const locale = ports.maybeText('locale') ?? DEFAULT_LOCALE;
  if (preset === 'relative') return { text: relative(milliseconds, environment.now(), locale) };
  if (preset !== 'pattern') {
    return { text: intlFormat(milliseconds, environment.timeZone, locale, preset) };
  }
  const pattern =
    ports.maybeText('pattern') ?? fail('Invalid', 'the pattern format needs a pattern');
  return {
    text: pattern.replace(TOKENS, (token) =>
      patternValue(token, milliseconds, environment.timeZone),
    ),
  };
};

interface Fields {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

const FIELD_PATTERN: Readonly<Record<string, string>> = {
  yyyy: '(\\d{4})',
  MM: '(\\d{2})',
  dd: '(\\d{2})',
  HH: '(\\d{2})',
  mm: '(\\d{2})',
  ss: '(\\d{2})',
};

function fieldsFrom(text: string, format: string): Fields | undefined {
  const names: string[] = [];
  const source = format.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(TOKENS, (token) => {
    names.push(token);
    return FIELD_PATTERN[token] ?? token;
  });
  const match = new RegExp(`^${source}$`).exec(text);
  if (match === null) return undefined;
  const read = (token: string, standard: number): number =>
    names.includes(token) ? Number(match[names.indexOf(token) + 1]) : standard;
  return {
    year: read('yyyy', 1970),
    month: read('MM', 1),
    day: read('dd', 1),
    hour: read('HH', 0),
    minute: read('mm', 0),
    second: read('ss', 0),
  };
}

function momentOf(fields: Fields, zone: string): number {
  const { year, month, day, hour, minute, second } = fields;
  const real = new Date(Date.UTC(year, month - 1, day));
  const calendar =
    real.getUTCFullYear() === year && real.getUTCMonth() === month - 1 && real.getUTCDate() === day;
  if (!calendar || hour > 23 || minute > 59 || second > 59) {
    return fail('Invalid', 'the date or time does not exist');
  }
  return zonedInstant({ year, month, day }, hour * 60 + minute, zone).getTime() + second * 1000;
}

function parseLocal(text: string, zone: string): number {
  for (const format of LOCAL_FORMATS) {
    const fields = fieldsFrom(text, format);
    if (fields !== undefined) return momentOf(fields, zone);
  }
  return fail('Invalid', `${text} is not a date and time`);
}

const parse: PureBody = (ports, environment) => {
  const text = ports.text('text');
  const zone = validZone(ports.maybeText('zone') ?? environment.timeZone);
  const pattern = ports.maybeText('format');
  if (pattern !== undefined) {
    const fields = fieldsFrom(text, pattern);
    if (fields === undefined) return fail('Invalid', `${text} does not match ${pattern}`);
    return { instant: isoOf(momentOf(fields, zone)), ok: true };
  }
  const milliseconds = isInstantText(text) ? Date.parse(text) : parseLocal(text, zone);
  return { instant: isoOf(milliseconds), ok: true };
};

const UNIT_MILLISECONDS: Readonly<Record<string, number>> = {
  seconds: 1000,
  minutes: MINUTE,
  hours: HOUR,
  days: DAY,
};

function monthsAhead(year: number, month: number, amount: number): [number, number] {
  const total = year * 12 + (month - 1) + amount;
  return [Math.floor(total / 12), (((total % 12) + 12) % 12) + 1];
}

function calendarShift(milliseconds: number, amount: number, unit: string, zone: string): number {
  if (!Number.isInteger(amount)) return fail('Invalid', `${unit} must be a whole number`);
  const clock = localClock(new Date(milliseconds), zone);
  const spare = milliseconds - Math.floor(milliseconds / MINUTE) * MINUTE;
  if (unit === 'days' || unit === 'weeks') {
    const date = shiftedDate(clock, unit === 'weeks' ? amount * 7 : amount);
    return zonedInstant(date, clock.minuteOfDay, zone).getTime() + spare;
  }
  const [year, month] = monthsAhead(
    clock.year,
    clock.month,
    unit === 'years' ? amount * 12 : amount,
  );
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const date = { year, month, day: Math.min(clock.day, last) };
  return zonedInstant(date, clock.minuteOfDay, zone).getTime() + spare;
}

const CALENDAR_UNITS = new Set(['days', 'weeks', 'months', 'years']);

const add: PureBody = (ports, environment) => {
  const milliseconds = instantOf(ports.need('instant'), 'instant');
  const unit = ports.text('unit');
  const amount = ports.number('amount') * (ports.flag('subtract') ? -1 : 1);
  if (CALENDAR_UNITS.has(unit)) {
    return { instant: isoOf(calendarShift(milliseconds, amount, unit, environment.timeZone)) };
  }
  const size = UNIT_MILLISECONDS[unit] ?? fail('Invalid', `${unit} is not a unit of time`);
  return { instant: isoOf(milliseconds + amount * size) };
};

const difference: PureBody = (ports) => {
  const span = instantOf(ports.need('to'), 'to') - instantOf(ports.need('from'), 'from');
  const duration = ports.flag('absolute') ? Math.abs(span) : span;
  const unit = ports.text('unit');
  const size = UNIT_MILLISECONDS[unit] ?? fail('Invalid', `${unit} is not a unit of time`);
  return { duration, amount: duration / size };
};

function isoWeek(year: number, month: number, day: number): number {
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.ceil(((date.getTime() - start) / DAY + 1) / 7);
}

const part: PureBody = (ports, environment) => {
  const clock = localClock(
    new Date(instantOf(ports.need('instant'), 'instant')),
    environment.timeZone,
  );
  const { year, month, day, weekday, minuteOfDay } = clock;
  return {
    year,
    month,
    day,
    weekday,
    hour: Math.floor(minuteOfDay / 60),
    minute: minuteOfDay % 60,
    dayOfYear: Math.round((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / DAY) + 1,
    week: isoWeek(year, month, day),
    isWeekend: weekday === 0 || weekday === 6,
    clock: clockText(minuteOfDay % DAY_MINUTES),
  };
};

function nonNegative(value: number, name: string): number {
  return value < 0 ? fail('Invalid', `${name} cannot be negative`) : value;
}

const duration: PureBody = (ports) => {
  const split = ports.maybeNumber('split');
  const total = finite(
    split === undefined
      ? nonNegative(ports.number('hours'), 'hours') * HOUR +
          nonNegative(ports.number('minutes'), 'minutes') * MINUTE +
          nonNegative(ports.number('seconds'), 'seconds') * 1000
      : nonNegative(split, 'the duration'),
    'the duration',
  );
  return outputs({
    duration: total,
    hours: Math.floor(total / HOUR),
    minutes: Math.floor((total % HOUR) / MINUTE),
    seconds: (total % MINUTE) / 1000,
    totalSeconds: total / 1000,
  });
};

export const DATE_BODIES: PureBodies = {
  'date.parse': parse,
  'date.format': format,
  'date.add': add,
  'date.difference': difference,
  'date.part': part,
  'date.duration': duration,
};
