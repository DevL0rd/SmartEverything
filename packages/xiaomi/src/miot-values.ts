import { z } from 'zod';
import { friendlyUnit, type JsonValue, type ValueDescriptor } from '@smarteverything/domain';
import { MiotSpecError, MiotValueError } from './errors';
import { hsvToRgb, rgbToHsv } from './color';
import type { MiotFormat, MiotProperty } from './spec';

export const TEXT_MAX_LENGTH = 4096;

export interface EnumOption {
  readonly label: string;
  readonly value: number;
}

export type ValueCodec =
  | { readonly kind: 'boolean' }
  | { readonly kind: 'inverted-boolean' }
  | { readonly kind: 'enum'; readonly options: readonly EnumOption[] }
  | { readonly kind: 'number' }
  | { readonly kind: 'text' }
  | { readonly kind: 'color' };

export interface PropertyValue {
  readonly descriptor: ValueDescriptor;
  readonly codec: ValueCodec;
}

const INTEGER_BOUNDS: ReadonlyMap<MiotFormat, readonly [number, number]> = new Map<
  MiotFormat,
  readonly [number, number]
>([
  ['uint8', [0, 255]],
  ['uint16', [0, 65_535]],
  ['uint32', [0, 4_294_967_295]],
  ['int8', [-128, 127]],
  ['int16', [-32_768, 32_767]],
  ['int32', [-2_147_483_648, 2_147_483_647]],
  ['int64', [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]],
]);

function unitOf(unit: string | undefined): { unit?: string } {
  const friendly = unit === 'none' ? null : friendlyUnit(unit);
  return friendly === null ? {} : { unit: friendly };
}

function enumOptions(list: readonly { value: number; description: string }[]): EnumOption[] {
  const labelled = list.map(({ value, description }) => ({
    value,
    label: description.trim() || String(value),
  }));
  return labelled.map(({ value, label }, index) =>
    labelled.findIndex((other) => other.label === label) === index
      ? { label, value }
      : { label: `${label} (${String(value)})`, value },
  );
}

function numberRange(property: MiotProperty): readonly [number, number, number] {
  const range = property['value-range'];
  if (range !== undefined) {
    return range;
  }
  const bounds = INTEGER_BOUNDS.get(property.format);
  if (bounds === undefined) {
    throw new MiotSpecError(property.type, 'a value-range for a float', 'none');
  }
  return [bounds[0], bounds[1], 1];
}

function describeNumber(property: MiotProperty): PropertyValue {
  const [min, max, step] = numberRange(property);
  if (step <= 0 || min > max) {
    throw new MiotSpecError(
      property.type,
      'a range with min ≤ max and a positive step',
      `[${String(min)}, ${String(max)}, ${String(step)}]`,
    );
  }
  return {
    descriptor: { kind: 'number', min, max, step, ...unitOf(property.unit) },
    codec: { kind: 'number' },
  };
}

export function describeProperty(property: MiotProperty): PropertyValue {
  const list = property['value-list'];
  if (list !== undefined && list.length > 0) {
    const options = enumOptions(list);
    return {
      descriptor: { kind: 'enum', options: options.map(({ label }) => label) },
      codec: { kind: 'enum', options },
    };
  }
  if (property.format === 'bool') {
    return { descriptor: { kind: 'boolean' }, codec: { kind: 'boolean' } };
  }
  if (property.format === 'string' || property.format === 'hex') {
    return { descriptor: { kind: 'text', maxLength: TEXT_MAX_LENGTH }, codec: { kind: 'text' } };
  }
  return describeNumber(property);
}

export function describeColor(): PropertyValue {
  return { descriptor: { kind: 'color' }, codec: { kind: 'color' } };
}

function fromDeviceEnum(subject: string, options: readonly EnumOption[], raw: unknown): JsonValue {
  const option = options.find(({ value }) => value === raw);
  if (option === undefined) {
    throw new MiotValueError(
      subject,
      `one of ${options.map(({ value }) => value).join(', ')}`,
      raw,
    );
  }
  return option.label;
}

const WIRE_BOOLEANS: ReadonlyMap<unknown, boolean> = new Map<unknown, boolean>([
  [true, true],
  [false, false],
  [1, true],
  [0, false],
  ['true', true],
  ['false', false],
]);

function fromDeviceBoolean(subject: string, raw: unknown): boolean {
  const value = WIRE_BOOLEANS.get(raw);
  if (value === undefined) {
    throw new MiotValueError(subject, 'true, false, 0, 1, "true" or "false"', raw);
  }
  return value;
}

function expectNumber(subject: string, raw: unknown): number {
  const parsed = z.number().safeParse(raw);
  if (!parsed.success) {
    throw new MiotValueError(subject, 'a finite number', raw);
  }
  return parsed.data;
}

export function fromDevice(subject: string, codec: ValueCodec, raw: unknown): JsonValue {
  switch (codec.kind) {
    case 'boolean':
      return fromDeviceBoolean(subject, raw);
    case 'inverted-boolean':
      return !fromDeviceBoolean(subject, raw);
    case 'enum':
      return fromDeviceEnum(subject, codec.options, raw);
    case 'number':
      return expectNumber(subject, raw);
    case 'color':
      return rgbToHsv(expectNumber(subject, raw));
    case 'text':
      if (typeof raw !== 'string') {
        throw new MiotValueError(subject, 'text', raw);
      }
      return raw;
  }
}

function toDeviceEnum(subject: string, options: readonly EnumOption[], value: JsonValue): number {
  const option = options.find(({ label }) => label === value);
  if (option === undefined) {
    throw new MiotValueError(
      subject,
      `one of ${options.map(({ label }) => label).join(', ')}`,
      value,
    );
  }
  return option.value;
}

export function toDevice(subject: string, codec: ValueCodec, value: JsonValue): JsonValue {
  switch (codec.kind) {
    case 'enum':
      return toDeviceEnum(subject, codec.options, value);
    case 'color':
      return hsvToRgb(subject, value);
    case 'inverted-boolean':
      if (typeof value !== 'boolean') {
        throw new MiotValueError(subject, 'true or false', value);
      }
      return !value;
    case 'boolean':
    case 'number':
    case 'text':
      return value;
  }
}
