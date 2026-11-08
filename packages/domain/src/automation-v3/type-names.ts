import type { FlowType } from './types';

type NumberType = Extract<FlowType, { readonly t: 'number' }>;

type RefType = Extract<FlowType, { readonly t: 'ref' }>;

function rangePhrase(type: NumberType): string {
  if (type.min !== undefined && type.max !== undefined) {
    return ` from ${String(type.min)} to ${String(type.max)}`;
  }
  if (type.min !== undefined) return ` of at least ${String(type.min)}`;
  return type.max === undefined ? '' : ` of at most ${String(type.max)}`;
}

function numberPhrase(type: NumberType): string {
  const base = type.integer === true ? 'whole number' : 'number';
  return `${base}${rangePhrase(type)}${type.unit === undefined ? '' : ` in ${type.unit}`}`;
}

export type EntityTitleOf = (of: string) => string | undefined;

function recordPhrase(
  type: Extract<FlowType, { readonly t: 'record' }>,
  entityTitle: EntityTitleOf,
): string {
  const fields = Object.entries(type.fields ?? {}).map(
    ([name, field]) => `${name}: ${phrase(field, entityTitle)}`,
  );
  const rest =
    type.values === undefined ? [] : [`other fields: ${phrase(type.values, entityTitle)}`];
  const parts = [...fields, ...rest];
  return parts.length === 0 ? 'record' : `record with ${parts.join(', ')}`;
}

function refPhrase(type: RefType): string {
  const needs = type.capabilities ?? [];
  const families = type.families ?? [];
  const base = families.length === 0 ? type.of : `${type.of} (${families.join(', ')})`;
  return needs.length === 0 ? base : `${base} that can ${needs.join(', ')}`;
}

const SCALAR_PHRASES = {
  boolean: 'on/off',
  text: 'text',
  duration: 'duration',
  instant: 'date and time',
  timeOfDay: 'time of day',
  date: 'date',
  color: 'color',
  error: 'error',
  any: 'any value',
} as const;

function phrase(type: FlowType, entityTitle: EntityTitleOf): string {
  if (type.t === 'number') return numberPhrase(type);
  if (type.t === 'list') return `list of ${phrase(type.of, entityTitle)}`;
  if (type.t === 'optional') return `optional ${phrase(type.of, entityTitle)}`;
  if (type.t === 'record') return recordPhrase(type, entityTitle);
  if (type.t === 'entity') return entityTitle(type.of) ?? type.of;
  if (type.t === 'choice')
    return `choice of ${type.options.map((option) => option.label).join(', ')}`;
  if (type.t === 'ref') return refPhrase(type);
  if (type.t === 'param') return type.name;
  return SCALAR_PHRASES[type.t];
}

function noEntityTitle(): string | undefined {
  return undefined;
}

export function typeDisplayName(
  type: FlowType,
  entityTitle: EntityTitleOf = noEntityTitle,
): string {
  const text = phrase(type, entityTitle);
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}
