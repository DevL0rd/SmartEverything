import { z } from 'zod';
import { JSON_VALUE, type JsonValue } from '@smarteverything/domain';
export type Schema = Readonly<Record<string, JsonValue>>;
export function arrayOf(value: JsonValue | undefined): readonly JsonValue[] {
  const checked = z.array(JSON_VALUE).safeParse(value);
  return checked.success ? checked.data : [];
}
const RECORD = z.record(z.string(), JSON_VALUE);
export function schemaOf(value: JsonValue | undefined): Schema {
  const result = RECORD.safeParse(value);
  return result.success ? result.data : {};
}
export function branches(schema: Schema): readonly Schema[] {
  const variants = schema['anyOf'] ?? schema['oneOf'];
  return Array.isArray(variants) ? arrayOf(variants).map(schemaOf) : [];
}
export function schemaType(schema: Schema): string {
  if (typeof schema['type'] === 'string') return schema['type'];
  if (schema['properties'] !== undefined || schema['additionalProperties'] !== undefined)
    return 'object';
  return 'string';
}
export function variantName(variant: Schema, index: number): string {
  const properties = schemaOf(variant['properties']);
  for (const key of ['action', 'view', 'kind']) {
    const marker = schemaOf(properties[key])['const'];
    if (typeof marker === 'string') return marker;
  }
  return schemaType(variant) === 'null'
    ? 'Reset override'
    : `${schemaType(variant)} ${String(index + 1)}`;
}

export function initialValue(schema: Schema): JsonValue {
  const variants = branches(schema);
  if (variants[0] !== undefined) return initialValue(variants[0]);
  if (schema['const'] !== undefined) return schema['const'];
  const first = arrayOf(schema['enum'])[0];
  if (first !== undefined) return first;
  const type = schemaType(schema);
  if (type === 'object') return {};
  if (type === 'array') return [];
  if (type === 'boolean') return false;
  if (type === 'number' || type === 'integer') return 0;
  return scalarDefault(type);
}
export function matchesType(schema: Schema, value: JsonValue): boolean {
  if (schema['const'] !== undefined) return schema['const'] === value;
  if (Array.isArray(schema['enum'])) return schema['enum'].includes(value);
  const type = schemaType(schema);
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'object')
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  return typeof value === (type === 'integer' ? 'number' : type);
}
export function valueSummary(value: JsonValue | undefined): string {
  if (value === undefined) return 'Not edited';
  if (value === null) return 'Reset to runtime default';
  if (Array.isArray(value)) return `${String(value.length)} items`;
  if (typeof value === 'object') return `${String(Object.keys(value).length)} fields`;
  return String(value);
}
export function replaceField(value: Schema, key: string, next: JsonValue | undefined): Schema {
  const rest = Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));
  return next === undefined ? rest : { ...rest, [key]: next };
}

function scalarDefault(type: string): JsonValue {
  return type === 'null' ? null : '';
}
