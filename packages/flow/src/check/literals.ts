import type { FlowType, JsonValue, RefKind } from '@smarteverything/domain';
import { canonicalType } from '../functions/interface-hash';
import { mapValues, own } from './scope-types';

type JsonObject = Readonly<Record<string, JsonValue>>;

export interface LiteralRef {
  readonly of: RefKind;
  readonly id: string;
}

const TARGET_KEYS = ['device', 'devices', 'room', 'group', 'families'] as const;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isList(value: JsonValue | undefined): value is readonly JsonValue[] {
  return Array.isArray(value);
}

function isText(value: JsonValue | undefined): value is string {
  return typeof value === 'string' && value !== '';
}

function isDate(value: JsonValue): boolean {
  if (typeof value !== 'string' || !DATE_ONLY.test(value)) return false;
  return new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
}

function isInstant(value: JsonValue): boolean {
  return typeof value === 'string' && ISO_INSTANT.test(value) && !Number.isNaN(Date.parse(value));
}

type ScalarTag = Exclude<
  FlowType['t'],
  'number' | 'choice' | 'ref' | 'list' | 'optional' | 'record'
>;

const SCALAR_FITS: Readonly<Record<ScalarTag, (value: JsonValue) => boolean>> = {
  boolean: (value) => typeof value === 'boolean',
  text: (value) => typeof value === 'string',
  duration: (value) => typeof value === 'number' && value >= 0,
  instant: isInstant,
  timeOfDay: (value) => typeof value === 'string' && TIME_OF_DAY.test(value),
  date: isDate,
  color: isObject,
  error: (value) => isObject(value) && typeof value['class'] === 'string',
  any: () => true,
  param: () => true,
};

function numberFits(type: Extract<FlowType, { readonly t: 'number' }>, value: JsonValue): boolean {
  if (typeof value !== 'number') return false;
  if (type.integer === true && !Number.isInteger(value)) return false;
  return (
    (type.min === undefined || value >= type.min) && (type.max === undefined || value <= type.max)
  );
}

function targetFits(value: JsonValue): boolean {
  if (!isObject(value)) return false;
  const keys = Object.keys(value);
  if (keys.length === 0 || keys.some((key) => !TARGET_KEYS.some((known) => known === key))) {
    return false;
  }
  return Object.entries(value).every(([key, item]) =>
    key === 'devices' || key === 'families' ? isList(item) && item.every(isText) : isText(item),
  );
}

function recordFits(type: Extract<FlowType, { readonly t: 'record' }>, value: JsonValue): boolean {
  if (!isObject(value)) return false;
  const declared = type.fields;
  if (declared === undefined && type.values === undefined) return true;
  const missing = Object.entries(declared ?? {}).some(
    ([name, member]) => !Object.hasOwn(value, name) && member.t !== 'optional',
  );
  return (
    !missing &&
    Object.entries(value).every(([name, item]) => {
      const member = own(declared, name) ?? type.values;
      return member !== undefined && literalFits(member, item);
    })
  );
}

export function literalFits(type: FlowType, value: JsonValue): boolean {
  if (type.t === 'number') return numberFits(type, value);
  if (type.t === 'choice') return type.options.some((option) => option.id === value);
  if (type.t === 'ref') return type.of === 'target' ? targetFits(value) : isText(value);
  if (type.t === 'list') return isList(value) && value.every((item) => literalFits(type.of, item));
  if (type.t === 'optional') return literalFits(type.of, value);
  if (type.t === 'record') return recordFits(type, value);
  return SCALAR_FITS[type.t](value);
}

function referenceIds(of: RefKind, value: JsonValue): readonly string[] {
  if (of !== 'target') return isText(value) ? [value] : [];
  if (!isObject(value)) return [];
  return TARGET_KEYS.filter((key) => key !== 'families').flatMap((key) => {
    const item = value[key];
    if (isList(item)) return item.filter(isText);
    return isText(item) ? [item] : [];
  });
}

export function literalRefs(type: FlowType, value: JsonValue): readonly LiteralRef[] {
  if (type.t === 'optional') return literalRefs(type.of, value);
  if (type.t === 'ref') return referenceIds(type.of, value).map((id) => ({ of: type.of, id }));
  if (type.t === 'list' && isList(value)) {
    return value.flatMap((item) => literalRefs(type.of, item));
  }
  if (type.t !== 'record' || !isObject(value)) return [];
  return Object.entries(value).flatMap(([name, item]) => {
    const member = own(type.fields, name) ?? type.values;
    return member === undefined ? [] : literalRefs(member, item);
  });
}

function commonType(types: readonly FlowType[]): FlowType {
  const [first] = types;
  if (first === undefined) return { t: 'any' };
  return types.every((type) => canonicalType(type) === canonicalType(first)) ? first : { t: 'any' };
}

export function literalType(value: JsonValue): FlowType {
  if (typeof value === 'boolean') return { t: 'boolean' };
  if (typeof value === 'number') return { t: 'number' };
  if (typeof value === 'string') return { t: 'text' };
  if (value === null) return { t: 'optional', of: { t: 'any' } };
  if (isList(value)) return { t: 'list', of: commonType(value.map(literalType)) };
  return { t: 'record', fields: mapValues(value, literalType) };
}
