import { z } from 'zod';
import { checkValue, type JsonValue, type ValueDescriptor } from '@smarteverything/domain';
import { TUYA_JSON_MAX_LENGTH, type DataPoint, type DataPointShape } from './data-points';

export type DeviceValue = string | number | boolean;

export class DataPointValueError extends Error {
  override readonly name = 'DataPointValueError';

  constructor(
    readonly code: string,
    readonly expected: string,
    readonly received: unknown,
  ) {
    super(`Tuya data point ${code} expected ${expected} but received ${JSON.stringify(received)}.`);
  }
}

export function scaled(value: number, scale: number): number {
  return Number((value / 10 ** scale).toFixed(scale));
}

export function unscaled(value: number, scale: number): number {
  return Math.round(value * 10 ** scale);
}

function base64Length(bytes: number): number {
  return Math.ceil(bytes / 3) * 4;
}

export function descriptorOf(shape: DataPointShape): ValueDescriptor {
  switch (shape.type) {
    case 'Boolean':
      return { kind: 'boolean' };
    case 'Integer':
      return {
        kind: 'number',
        min: scaled(shape.min, shape.scale),
        max: scaled(shape.max, shape.scale),
        step: scaled(shape.step, shape.scale),
        ...(shape.unit === null ? {} : { unit: shape.unit }),
      };
    case 'Enum':
      return { kind: 'enum', options: [...shape.range] };
    case 'String':
      return { kind: 'text', maxLength: shape.maxLength };
    case 'Raw':
      return { kind: 'text', maxLength: base64Length(shape.maxLength) };
    case 'Json':
      return { kind: 'text', maxLength: TUYA_JSON_MAX_LENGTH };
    case 'Bitmap':
      return { kind: 'number', min: 0, max: 2 ** shape.bits - 1, step: 1 };
  }
}

const FINITE = z.number();

function numberFrom(point: DataPoint, raw: unknown): number {
  const parsed = FINITE.safeParse(raw);
  if (!parsed.success) {
    throw new DataPointValueError(point.code, 'a number', raw);
  }
  return parsed.data;
}

function textFrom(point: DataPoint, raw: unknown): string {
  if (typeof raw === 'string') {
    return raw;
  }
  if (point.shape.type === 'Json' && typeof raw === 'object' && raw !== null) {
    return JSON.stringify(raw);
  }
  throw new DataPointValueError(point.code, 'text', raw);
}

export function fromDevice(point: DataPoint, raw: unknown): JsonValue {
  switch (point.shape.type) {
    case 'Boolean':
      if (typeof raw !== 'boolean') {
        throw new DataPointValueError(point.code, 'true or false', raw);
      }
      return raw;
    case 'Integer':
      return scaled(numberFrom(point, raw), point.shape.scale);
    case 'Bitmap':
      return numberFrom(point, raw);
    case 'Enum':
    case 'String':
    case 'Raw':
    case 'Json':
      return textFrom(point, raw);
  }
}

const DEVICE_VALUE = z.union([z.string(), z.number(), z.boolean()]);

export function toDevice(point: DataPoint, value: unknown): DeviceValue {
  const checked = checkValue(descriptorOf(point.shape), value);
  if (point.shape.type === 'Integer') {
    return unscaled(z.number().parse(checked), point.shape.scale);
  }
  return DEVICE_VALUE.parse(checked);
}
