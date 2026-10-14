import { z } from 'zod';

export type JsonValue =
  string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export const JSON_VALUE: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JSON_VALUE),
    z.record(z.string(), JSON_VALUE),
  ]),
);

export const BOOLEAN_VALUE = z.object({ kind: z.literal('boolean') });

export const NUMBER_VALUE = z
  .object({
    kind: z.literal('number'),
    min: z.number(),
    max: z.number(),
    step: z.number().positive(),
    unit: z.string().optional(),
  })
  .refine((range) => range.min <= range.max, { message: 'min must not exceed max' });

export const ENUM_VALUE = z.object({
  kind: z.literal('enum'),
  options: z.array(z.string().min(1)).min(1),
});

export const COLOR_VALUE = z.object({ kind: z.literal('color') });

export const TEXT_VALUE = z.object({
  kind: z.literal('text'),
  maxLength: z.number().int().positive(),
});

export const ACTION_VALUE = z.object({
  kind: z.literal('action'),
  arguments: z.array(z.string().min(1)).optional(),
  argumentSchema: JSON_VALUE.optional(),
});

export const VALUE_DESCRIPTOR = z.discriminatedUnion('kind', [
  BOOLEAN_VALUE,
  NUMBER_VALUE,
  ENUM_VALUE,
  COLOR_VALUE,
  TEXT_VALUE,
  ACTION_VALUE,
]);

export type ValueDescriptor = z.infer<typeof VALUE_DESCRIPTOR>;

export const HSV_COLOR = z.object({
  hue: z.number().min(0).max(360),
  saturation: z.number().min(0).max(100),
  value: z.number().min(0).max(100),
});

export type HsvColor = z.infer<typeof HSV_COLOR>;

export class InvalidValueError extends Error {
  override readonly name = 'InvalidValueError';

  constructor(
    readonly descriptor: ValueDescriptor,
    readonly received: unknown,
    readonly reason: string,
  ) {
    super(`Expected a ${descriptor.kind} value: ${reason}. Received ${JSON.stringify(received)}.`);
  }
}

function isOnStep(value: number, min: number, step: number): boolean {
  const snapped = min + Math.round((value - min) / step) * step;
  return Number(snapped.toPrecision(12)) === Number(value.toPrecision(12));
}

function checkNumber(descriptor: z.infer<typeof NUMBER_VALUE>, value: unknown): JsonValue {
  const parsed = z.number().safeParse(value);
  if (!parsed.success) {
    throw new InvalidValueError(descriptor, value, 'not a finite number');
  }
  const number = parsed.data;
  if (number < descriptor.min || number > descriptor.max) {
    throw new InvalidValueError(
      descriptor,
      value,
      `outside ${String(descriptor.min)} to ${String(descriptor.max)}`,
    );
  }
  if (!isOnStep(number, descriptor.min, descriptor.step)) {
    throw new InvalidValueError(descriptor, value, `not a multiple of ${String(descriptor.step)}`);
  }
  return number;
}

function checkActionArguments(descriptor: z.infer<typeof ACTION_VALUE>, value: unknown): JsonValue {
  if (descriptor.arguments === undefined) {
    if (value !== null) {
      throw new InvalidValueError(descriptor, value, 'this action takes no arguments');
    }
    return null;
  }
  const allowed = new Set(descriptor.arguments);
  const parsed = z.record(z.string(), JSON_VALUE).safeParse(value);
  if (!parsed.success) {
    throw new InvalidValueError(descriptor, value, 'arguments must be an object');
  }
  const unknown = Object.keys(parsed.data).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new InvalidValueError(descriptor, value, `unknown arguments ${unknown.join(', ')}`);
  }
  return parsed.data;
}

function checkEnum(descriptor: z.infer<typeof ENUM_VALUE>, value: unknown): JsonValue {
  const option = descriptor.options.find((candidate) => candidate === value);
  if (option === undefined) {
    throw new InvalidValueError(descriptor, value, `not one of ${descriptor.options.join(', ')}`);
  }
  return option;
}

function checkText(descriptor: z.infer<typeof TEXT_VALUE>, value: unknown): JsonValue {
  if (typeof value !== 'string' || value.length > descriptor.maxLength) {
    throw new InvalidValueError(
      descriptor,
      value,
      `not text of at most ${String(descriptor.maxLength)} characters`,
    );
  }
  return value;
}

function checkColor(descriptor: z.infer<typeof COLOR_VALUE>, value: unknown): JsonValue {
  const parsed = HSV_COLOR.safeParse(value);
  if (!parsed.success) {
    throw new InvalidValueError(descriptor, value, 'not a hue, saturation and value');
  }
  return parsed.data;
}

function checkBoolean(descriptor: z.infer<typeof BOOLEAN_VALUE>, value: unknown): JsonValue {
  if (typeof value !== 'boolean') {
    throw new InvalidValueError(descriptor, value, 'not true or false');
  }
  return value;
}

export function checkValue(descriptor: ValueDescriptor, value: unknown): JsonValue {
  switch (descriptor.kind) {
    case 'boolean':
      return checkBoolean(descriptor, value);
    case 'number':
      return checkNumber(descriptor, value);
    case 'enum':
      return checkEnum(descriptor, value);
    case 'color':
      return checkColor(descriptor, value);
    case 'text':
      return checkText(descriptor, value);
    case 'action':
      return checkActionArguments(descriptor, value);
  }
}
