import { z } from 'zod';
import { IDENT } from '../automation-v3/ident';
import { JSON_VALUE, type JsonValue } from '../values';

export const AI_SHAPE_FIELD_TYPES = [
  'text',
  'number',
  'boolean',
  'list_of_text',
  'list_of_number',
] as const;

export type AiShapeFieldType = (typeof AI_SHAPE_FIELD_TYPES)[number];

export const AI_SHAPE = z
  .record(IDENT, z.enum(AI_SHAPE_FIELD_TYPES))
  .refine((shape) => Object.keys(shape).length > 0, {
    message: 'a shape needs at least one field',
  });

export type AiShape = z.infer<typeof AI_SHAPE>;

const FIELD_SCHEMAS: Readonly<Record<AiShapeFieldType, z.ZodType<JsonValue>>> = {
  text: z.string(),
  number: z.number(),
  boolean: z.boolean(),
  list_of_text: z.array(z.string()),
  list_of_number: z.array(z.number()),
};

export const AI_SHAPE_FIELD_HINTS: Readonly<Record<AiShapeFieldType, string>> = {
  text: 'a string',
  number: 'a number',
  boolean: 'true or false',
  list_of_text: 'an array of strings',
  list_of_number: 'an array of numbers',
};

export function aiShapeSchema(shape: AiShape): z.ZodType<Readonly<Record<string, JsonValue>>> {
  const fields = Object.entries(shape).map(([name, type]) => [name, FIELD_SCHEMAS[type]] as const);
  return z.strictObject(Object.fromEntries(fields));
}

export function aiShapeInstruction(shape: AiShape): string {
  const lines = Object.entries(shape).map(
    ([name, type]) => `"${name}": ${AI_SHAPE_FIELD_HINTS[type]}`,
  );
  return `Answer with one JSON object and nothing else, with exactly these fields: ${lines.join(', ')}.`;
}

export const AI_DECISION_SHAPE: AiShape = { answer: 'boolean', reason: 'text' };

export const AI_DECISION = z.strictObject({ answer: z.boolean(), reason: z.string() });

export function aiJsonOf(text: string): JsonValue | undefined {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON_VALUE.parse(JSON.parse(text.slice(start, end + 1)));
  } catch (cause) {
    if (cause instanceof SyntaxError) return undefined;
    throw cause;
  }
}
