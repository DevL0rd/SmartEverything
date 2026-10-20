import type { JsonValue, PluginStreamRow, WidgetStreamRef } from '@smarteverything/domain';

export type StreamValue =
  | { readonly state: 'missing'; readonly reason: string }
  | { readonly state: 'ready'; readonly value: JsonValue; readonly at: string };

export type NumberReading =
  | { readonly state: 'missing'; readonly reason: string }
  | { readonly state: 'ready'; readonly value: number; readonly at: string };

export type TextReading =
  | { readonly state: 'missing'; readonly reason: string }
  | { readonly state: 'ready'; readonly text: string; readonly at: string };

export type FlagReading =
  | { readonly state: 'missing'; readonly reason: string }
  | { readonly state: 'ready'; readonly on: boolean; readonly at: string };

export interface ListItem {
  readonly key: string;
  readonly title: string;
  readonly detail: string | null;
}

export type ListReading =
  | { readonly state: 'missing'; readonly reason: string }
  | { readonly state: 'ready'; readonly items: readonly ListItem[]; readonly total: number };

const NO_READING = 'No reading yet.';

function missing(reason: string): { readonly state: 'missing'; readonly reason: string } {
  return { state: 'missing', reason };
}

function isRecord(value: JsonValue): value is Readonly<Record<string, JsonValue>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function pickStreamValue(
  row: PluginStreamRow | undefined,
  ref: WidgetStreamRef,
): StreamValue {
  if (row === undefined) return missing(NO_READING);
  if (ref.field === null) return { state: 'ready', value: row.value, at: row.at };
  let value: JsonValue = row.value;
  for (const step of ref.field.split('.')) {
    if (!isRecord(value) || !(step in value)) return missing(`The reading has no ${ref.field}.`);
    value = value[step] ?? null;
  }
  return { state: 'ready', value, at: row.at };
}

export function numberReading(reading: StreamValue): NumberReading {
  if (reading.state === 'missing') return reading;
  const { value } = reading;
  return typeof value === 'number' && Number.isFinite(value)
    ? { state: 'ready', value, at: reading.at }
    : missing('The reading is not a number.');
}

function textOf(value: JsonValue): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return formatNumber(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return null;
}

export function formatNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

export function textReading(reading: StreamValue): TextReading {
  if (reading.state === 'missing') return reading;
  const text = textOf(reading.value);
  return text === null
    ? missing('The reading is not a single value.')
    : { state: 'ready', text, at: reading.at };
}

export function flagReading(reading: StreamValue): FlagReading {
  if (reading.state === 'missing') return reading;
  return typeof reading.value === 'boolean'
    ? { state: 'ready', on: reading.value, at: reading.at }
    : missing('The reading is not on or off.');
}

function itemOf(value: JsonValue, index: number): ListItem | null {
  const key = String(index);
  const title = textOf(value);
  if (title !== null) return { key, title, detail: null };
  if (!isRecord(value)) return null;
  const named = value['title'];
  if (typeof named !== 'string') return null;
  const detail = value['detail'];
  return { key, title: named, detail: typeof detail === 'string' ? detail : null };
}

export function listReading(reading: StreamValue, limit: number): ListReading {
  if (reading.state === 'missing') return reading;
  const { value } = reading;
  if (!Array.isArray(value)) return missing('The reading is not a list.');
  const items = value.map(itemOf);
  if (items.some((item) => item === null)) {
    return missing('The list has items without a title.');
  }
  return {
    state: 'ready',
    items: items.slice(0, limit).flatMap((item) => item ?? []),
    total: items.length,
  };
}
