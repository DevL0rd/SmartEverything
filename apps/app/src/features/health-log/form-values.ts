import type { HealthEntryInput, HealthEntryRow } from '@smarteverything/domain';
import type { LogField, LogForm } from './forms';
import { zoneOffsetSecondsAt } from '../../format/time';

export type LogValue = number | string;

export type LogValues = Readonly<Record<string, LogValue>>;

const MINUTE_MS = 60_000;

export interface LogTime {
  readonly start: number;
  readonly minutes: number;
}

function stored(field: LogField, value: LogValue): unknown {
  if (field.kind === 'text') {
    const text = String(value).trim();
    return text === '' ? null : text;
  }
  const number = Number(value);
  return field.kind === 'number'
    ? Math.round(number * (field.scale ?? 1) * 10_000) / 10_000
    : number;
}

function shown(field: LogField, data: Readonly<Record<string, unknown>>): LogValue {
  const value = data[field.key];
  if (field.kind === 'text') {
    return typeof value === 'string' ? value : '';
  }
  if (typeof value !== 'number') {
    return field.initial;
  }
  return field.kind === 'number' ? Math.round((value / (field.scale ?? 1)) * 100) / 100 : value;
}

export function initialValues(form: LogForm, entry: HealthEntryRow | null): LogValues {
  return Object.fromEntries(
    form.fields.map((field) => [
      field.key,
      entry === null ? (field.kind === 'text' ? '' : field.initial) : shown(field, entry.data),
    ]),
  );
}

export function initialTime(form: LogForm, entry: HealthEntryRow | null, now: number): LogTime {
  if (entry !== null) {
    const start = Date.parse(entry.start_time);
    const end = entry.end_time === null ? start : Date.parse(entry.end_time);
    return { start, minutes: Math.round((end - start) / MINUTE_MS) };
  }
  const minutes = form.minutes ?? 0;
  return { start: form.timing === 'instant' ? now : now - minutes * MINUTE_MS, minutes };
}

export function entryOfForm(form: LogForm, values: LogValues, time: LogTime): HealthEntryInput {
  const data: Record<string, unknown> = { ...form.fixed };
  for (const field of form.fields) {
    data[field.key] = stored(field, values[field.key] ?? '');
  }
  return {
    type: form.type,
    startTime: new Date(time.start).toISOString(),
    endTime:
      form.timing === 'instant'
        ? null
        : new Date(time.start + time.minutes * MINUTE_MS).toISOString(),
    zoneOffsetSeconds: zoneOffsetSecondsAt(time.start),
    data,
    food: null,
  };
}
