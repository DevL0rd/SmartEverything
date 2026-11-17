import { clockIn, clockOfMinutes } from './time';
import { twoDigits } from './number';

export interface ClockTime {
  readonly hour: number;
  readonly minute: number;
}

export function timeOfClockText(text: string): ClockTime {
  const [hour = 0, minute = 0] = text.split(':').map(Number);
  return { hour, minute };
}

export function clockTextOfTime(time: ClockTime): string {
  return `${twoDigits(time.hour)}:${twoDigits(time.minute)}`;
}

export interface ClockParts {
  readonly value: string;
  readonly period: string | null;
}

const TWELVE_HOUR = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: 'UTC',
});

function periodOf(time: ClockTime): string {
  const parts = TWELVE_HOUR.formatToParts(Date.UTC(2000, 0, 1, time.hour, time.minute));
  const period = parts.find((part) => part.type === 'dayPeriod');
  if (period === undefined) {
    throw new RangeError(
      `The locale's 12-hour clock gave no AM or PM for ${clockTextOfTime(time)}.`,
    );
  }
  return period.value;
}

function twelveHourOf(hour: number): number {
  return hour % 12 === 0 ? 12 : hour % 12;
}

export function clockPartsOf(text: string, hour24: boolean): ClockParts {
  const time = timeOfClockText(text);
  if (hour24) return { value: clockTextOfTime(time), period: null };
  return {
    value: `${String(twelveHourOf(time.hour))}:${twoDigits(time.minute)}`,
    period: periodOf(time),
  };
}

export function clockLabelOf(text: string, hour24: boolean): string {
  const parts = clockPartsOf(text, hour24);
  return parts.period === null ? parts.value : `${parts.value} ${parts.period}`;
}

export type MomentText = (moment: Date | string | number, timeZone?: string | null) => string;

export interface ClockFormat {
  readonly hour24: boolean;
  readonly instant: MomentText;
  readonly text: (time: string) => string;
  readonly minutes: (minuteOfDay: number) => string;
  readonly hour: (hour: number) => string;
  readonly shortHour: (hour: number) => string;
}

function hourLabelOf(hour: number, hour24: boolean): string {
  const wrapped = ((hour % 24) + 24) % 24;
  if (hour24) return twoDigits(wrapped);
  return `${String(twelveHourOf(wrapped))} ${periodOf({ hour: wrapped, minute: 0 })}`;
}

function formatOf(hour24: boolean): ClockFormat {
  return {
    hour24,
    instant: (moment, timeZone = null) => clockIn(hour24, moment, timeZone),
    text: (time) => clockLabelOf(time, hour24),
    minutes: (minuteOfDay) => clockLabelOf(clockOfMinutes(minuteOfDay), hour24),
    hour: (hour) => hourLabelOf(hour, hour24),
    shortHour: (hour): string => {
      const wrapped = ((hour % 24) + 24) % 24;
      return hour24 ? twoDigits(wrapped) : String(twelveHourOf(wrapped));
    },
  };
}

const HOUR_24 = formatOf(true);
const HOUR_12 = formatOf(false);

export function clockFormatOf(hour24: boolean): ClockFormat {
  return hour24 ? HOUR_24 : HOUR_12;
}
