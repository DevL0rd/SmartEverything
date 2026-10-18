import { z } from 'zod';
import type { SpecificationItem } from './cloud-api';

export const TUYA_TEXT_MAX_LENGTH = 255;

export const TUYA_JSON_MAX_LENGTH = 4096;

export type DataPointShape =
  | { readonly type: 'Boolean' }
  | {
      readonly type: 'Integer';
      readonly min: number;
      readonly max: number;
      readonly step: number;
      readonly scale: number;
      readonly unit: string | null;
    }
  | { readonly type: 'Enum'; readonly range: readonly string[] }
  | { readonly type: 'String'; readonly maxLength: number }
  | { readonly type: 'Raw'; readonly maxLength: number }
  | { readonly type: 'Json'; readonly definition: string }
  | { readonly type: 'Bitmap'; readonly labels: readonly string[]; readonly bits: number };

export interface DataPoint {
  readonly code: string;
  readonly dpId: number | null;
  readonly name: string | null;
  readonly readable: boolean;
  readonly writable: boolean;
  readonly shape: DataPointShape;
}

export interface RejectedDataPoint {
  readonly code: string;
  readonly reason: string;
}

export interface DataPoints {
  readonly points: readonly DataPoint[];
  readonly rejected: readonly RejectedDataPoint[];
}

type Outcome<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };

function accepted<T>(value: T): Outcome<T> {
  return { ok: true, value };
}

function refused<T>(reason: string): Outcome<T> {
  return { ok: false, reason };
}

const INTEGER_VALUES = z
  .object({
    min: z.number().int(),
    max: z.number().int(),
    step: z.number().int().positive(),
    scale: z.number().int().min(0).max(9).default(0),
    unit: z.string().default(''),
  })
  .refine((values) => values.min <= values.max, { message: 'min exceeds max' });

const ENUM_VALUES = z.object({ range: z.array(z.string().min(1)).min(1) });

const LENGTH_VALUES = z.object({ maxlen: z.number().int().positive().optional() });

const BITMAP_VALUES = z.object({
  label: z.array(z.string()).default([]),
  maxlen: z.number().int().positive().max(32),
});

export type PointSource = Omit<SpecificationItem, 'dp_id'> & { readonly dp_id: number | null };

export interface PointSources {
  readonly functions: readonly PointSource[];
  readonly status: readonly PointSource[];
}

function valuesOf(item: PointSource): Outcome<unknown> {
  try {
    return accepted(JSON.parse(item.values));
  } catch (cause) {
    return refused(`its values are not JSON (${String(cause)})`);
  }
}

function parsed<S extends z.ZodType, T>(
  schema: S,
  item: PointSource,
  shape: (values: z.output<S>) => T,
): Outcome<T> {
  const values = valuesOf(item);
  if (!values.ok) {
    return values;
  }
  const result = schema.safeParse(values.value);
  if (!result.success) {
    return refused(z.prettifyError(result.error));
  }
  return accepted(shape(result.data));
}

function integerShape(item: PointSource): Outcome<DataPointShape> {
  return parsed(INTEGER_VALUES, item, (integer) => ({
    type: 'Integer',
    min: integer.min,
    max: integer.max,
    step: integer.step,
    scale: integer.scale,
    unit: integer.unit === '' ? null : integer.unit,
  }));
}

function shapeOf(item: PointSource): Outcome<DataPointShape> {
  switch (item.type) {
    case 'Boolean':
      return accepted({ type: 'Boolean' });
    case 'Integer':
      return integerShape(item);
    case 'Enum':
      return parsed(ENUM_VALUES, item, (values) => ({ type: 'Enum', range: values.range }));
    case 'String':
      return parsed(LENGTH_VALUES, item, (values) => ({
        type: 'String',
        maxLength: values.maxlen ?? TUYA_TEXT_MAX_LENGTH,
      }));
    case 'Raw':
      return parsed(LENGTH_VALUES, item, (values) => ({
        type: 'Raw',
        maxLength: values.maxlen ?? TUYA_TEXT_MAX_LENGTH,
      }));
    case 'Json':
      return accepted({ type: 'Json', definition: item.values });
    case 'Bitmap':
      return parsed(BITMAP_VALUES, item, (values) => ({
        type: 'Bitmap',
        labels: values.label,
        bits: values.maxlen,
      }));
    default:
      return refused(`its type "${item.type}" is not a Tuya data point type`);
  }
}

export function dataPointsOf(specification: PointSources): DataPoints {
  const statusCodes = new Set(specification.status.map((item) => item.code));
  const functionCodes = new Set(specification.functions.map((item) => item.code));
  const items = [
    ...specification.functions,
    ...specification.status.filter((item) => !functionCodes.has(item.code)),
  ];
  const points: DataPoint[] = [];
  const rejected: RejectedDataPoint[] = [];
  for (const item of items) {
    const shape = shapeOf(item);
    if (shape.ok) {
      points.push({
        code: item.code,
        dpId: item.dp_id,
        name: item.name,
        readable: statusCodes.has(item.code),
        writable: functionCodes.has(item.code),
        shape: shape.value,
      });
    } else {
      rejected.push({ code: item.code, reason: shape.reason });
    }
  }
  return { points, rejected };
}
