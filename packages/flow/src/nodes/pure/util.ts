import { jsonEquals } from '@smarteverything/domain';
import type { JsonValue } from '@smarteverything/domain';
import { DAY, HOUR, MINUTE, isInstantText } from './moments';
import type { PureBodies, PureBody } from './support';
import { describe, fail, isList, isNumber, isRecord, isText } from './support';

const DURATION = /^(\d+(\.\d+)?(ms|s|m|h|d))+$/;
const DURATION_PART = /(\d+(?:\.\d+)?)(ms|s|m|h|d)/g;
const UNITS: Readonly<Record<string, number>> = {
  ms: 1,
  s: 1000,
  m: MINUTE,
  h: HOUR,
  d: DAY,
};
const TRUE_WORDS = new Set(['true', 'yes', 'on', '1']);
const FALSE_WORDS = new Set(['false', 'no', 'off', '0']);

function numberFrom(value: JsonValue): number | undefined {
  if (isNumber(value)) return value;
  if (!isText(value) || value.trim() === '') return undefined;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function textFrom(value: JsonValue): string | undefined {
  if (isText(value)) return value;
  if (value === null) return undefined;
  return typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : JSON.stringify(value);
}

function booleanFrom(value: JsonValue): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (!isText(value) && !isNumber(value)) return undefined;
  const word = String(value).trim().toLowerCase();
  if (TRUE_WORDS.has(word)) return true;
  return FALSE_WORDS.has(word) ? false : undefined;
}

function durationFrom(value: JsonValue): number | undefined {
  if (isNumber(value)) return value >= 0 ? value : undefined;
  if (!isText(value) || !DURATION.test(value.trim())) return undefined;
  return [...value.trim().matchAll(DURATION_PART)].reduce(
    (total, [, amount = '0', unit = 'ms']) => total + Number(amount) * (UNITS[unit] ?? 0),
    0,
  );
}

function instantFrom(value: JsonValue): string | undefined {
  return isInstantText(value) ? value : undefined;
}

function listFrom(value: JsonValue): JsonValue | undefined {
  if (isList(value)) return value;
  return value === null ? [] : [value];
}

const CONVERTERS: Readonly<Record<string, (value: JsonValue) => JsonValue | undefined>> = {
  number: numberFrom,
  text: textFrom,
  boolean: booleanFrom,
  duration: durationFrom,
  instant: instantFrom,
  list: listFrom,
};

const convert: PureBody = (ports) => {
  const value = ports.need('value');
  const to = ports.text('to');
  const converted = (CONVERTERS[to] ?? fail('Invalid', `${to} is not a type to convert to`))(value);
  if (converted !== undefined) return { result: converted, ok: true };
  const fallback = ports.raw('default');
  if (fallback === undefined) return fail('Invalid', `cannot convert ${describe(value)} to ${to}`);
  return { result: fallback, ok: false };
};

function rowOf(row: JsonValue): { key: JsonValue; value: JsonValue } {
  if (!isRecord(row) || row['key'] === undefined || row['value'] === undefined) {
    return fail('Invalid', 'each lookup row needs a key and a value');
  }
  return { key: row['key'], value: row['value'] };
}

const lookup: PureBody = (ports) => {
  const key = ports.need('key');
  const rows = ports.list('rows').map(rowOf);
  const hit = rows.find((row) => jsonEquals(row.key, key));
  if (hit !== undefined) return { value: hit.value, found: true };
  const fallback = ports.raw('default');
  return fallback === undefined ? { found: false } : { value: fallback, found: false };
};

export const UTIL_BODIES: PureBodies = {
  'util.convert': convert,
  'util.lookup': lookup,
};
