import { AI_MEMORY_KIND, AI_MEMORY_SCOPE, AI_MEMORY_TEXT } from '@smarteverything/domain';
import { messageOf } from '@smarteverything/logging';
import { z } from 'zod';

const DATE = z.iso.date().nullable();

const MANAGER_TEXT = AI_MEMORY_TEXT.max(500);

const SIGNIFICANCE = z.int().min(0).max(100);

export const MEMORY_OPERATION = z.discriminatedUnion('op', [
  z.strictObject({
    op: z.literal('add'),
    scope: AI_MEMORY_SCOPE,
    kind: AI_MEMORY_KIND,
    significance: SIGNIFICANCE,
    text: MANAGER_TEXT,
    happened_on: DATE,
    valid_until: DATE,
  }),
  z.strictObject({
    op: z.literal('update'),
    id: z.uuid(),
    text: MANAGER_TEXT,
    kind: AI_MEMORY_KIND,
    significance: SIGNIFICANCE,
    happened_on: DATE,
    valid_until: DATE,
  }),
  z.strictObject({ op: z.literal('delete'), id: z.uuid() }),
]);

export type MemoryOperation = z.output<typeof MEMORY_OPERATION>;

export const MEMORY_OPERATIONS = z.strictObject({ operations: z.array(MEMORY_OPERATION) });

export const MEMORY_SPLIT = z.strictObject({
  id: z.uuid(),
  parts: z
    .array(
      z.strictObject({
        text: MANAGER_TEXT,
        kind: AI_MEMORY_KIND,
        significance: SIGNIFICANCE,
        happened_on: DATE,
        valid_until: DATE,
      }),
    )
    .min(2),
});

export type MemorySplit = z.output<typeof MEMORY_SPLIT>;

export const MEMORY_REVIEW = z.strictObject({
  ratings: z.array(z.strictObject({ id: z.uuid(), significance: SIGNIFICANCE })),
  splits: z.array(MEMORY_SPLIT),
});

export type MemoryReviewAnswer = z.output<typeof MEMORY_REVIEW>;

const FENCE = /^```[a-z]*\s*\n?([\s\S]*?)\n?```\s*$/iu;

export type Parsed<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };

export type ParsedOperations =
  | { readonly ok: true; readonly operations: readonly MemoryOperation[] }
  | { readonly ok: false; readonly reason: string };

export function parseAnswer<T>(raw: string, schema: z.ZodType<T>): Parsed<T> {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: false, reason: 'The answer was empty.' };
  const unfenced = FENCE.exec(trimmed)?.[1] ?? trimmed;
  let json: unknown;
  try {
    json = JSON.parse(unfenced);
  } catch (cause) {
    return { ok: false, reason: `The answer was not valid JSON: ${messageOf(cause)}` };
  }
  const parsed = schema.safeParse(json);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, reason: z.prettifyError(parsed.error) };
}

export function parseOperations(raw: string): ParsedOperations {
  const parsed = parseAnswer(raw, MEMORY_OPERATIONS);
  return parsed.ok ? { ok: true, operations: parsed.value.operations } : parsed;
}
