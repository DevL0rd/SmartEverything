import { z } from 'zod';
import type { PlainObject } from './plain';

export function setOf<T>(item: z.ZodType<T>): z.ZodType<readonly T[]> {
  return z.union([z.array(item), item.transform((value): readonly T[] => [value])]);
}

export interface DropReporter {
  readonly dropped: (attribute: string, reason: string) => void;
}

const TOLERANT = new WeakMap<z.ZodType, z.ZodType>();

function tolerant<S extends z.ZodType>(schema: S, accepts: z.ZodType): S {
  TOLERANT.set(schema, accepts);
  return schema;
}

export function maybe<T>(item: z.ZodType<T>): z.ZodType<T | undefined> {
  return tolerant(item.optional(), item);
}

export function orNull<T>(item: z.ZodType<T>): z.ZodType<T | null> {
  return tolerant(
    item.optional().transform((value): T | null => value ?? null),
    item,
  );
}

export function textOrNull(): z.ZodType<string | null> {
  return tolerant(
    z
      .string()
      .optional()
      .transform((value): string | null => (value === undefined || value === '' ? null : value)),
    z.string(),
  );
}

export function maybeSet<T>(item: z.ZodType<T>): z.ZodType<readonly T[]> {
  const set = setOf(item);
  return tolerant(
    set.optional().transform((value): readonly T[] => value ?? []),
    set,
  );
}

const LOOSE_OBJECT = z.record(z.string(), z.unknown());

function reasonOf(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'invalid value';
}

function scrub(
  schema: z.ZodObject,
  input: Readonly<Record<string, unknown>>,
  report: DropReporter | undefined,
  prefix: string,
): Record<string, unknown> {
  const clean: Record<string, unknown> = { ...input };
  for (const [key, field] of Object.entries(schema.shape)) {
    const accepts = TOLERANT.get(field);
    const value = input[key];
    if (accepts === undefined || value === undefined) continue;
    const nested = LOOSE_OBJECT.safeParse(value);
    if (accepts instanceof z.ZodObject && nested.success) {
      clean[key] = scrub(accepts, nested.data, report, `${prefix}${key}.`);
    }
    const checked = accepts.safeParse(clean[key]);
    if (!checked.success) {
      delete clean[key];
      report?.dropped(`${prefix}${key}`, reasonOf(checked.error));
    }
  }
  return clean;
}

export function readSource<S extends z.ZodObject>(
  schema: S,
  plain: PlainObject,
  report?: DropReporter,
): z.output<S> {
  return schema.parse(scrub(schema, plain, report, ''));
}

export function trySource<S extends z.ZodObject>(
  schema: S,
  plain: PlainObject,
  report?: DropReporter,
): z.ZodSafeParseResult<z.output<S>> {
  const parsed = schema.safeParse(scrub(schema, plain, report, ''));
  if (!parsed.success) {
    report?.dropped(
      parsed.error.issues[0]?.path.join('.') || 'record',
      `record skipped: ${reasonOf(parsed.error)}`,
    );
  }
  return parsed;
}

export function present(source: PlainObject): PlainObject {
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== null));
}

export function keyValues(text: string): ReadonlyMap<string, string> {
  const pairs = new Map<string, string>();
  for (const part of text.split(';')) {
    const split = part.indexOf('=');
    if (split > 0) pairs.set(part.slice(0, split).trim(), part.slice(split + 1).trim());
  }
  return pairs;
}

export function numberOf(pairs: ReadonlyMap<string, string>, key: string): number | null {
  const text = pairs.get(key);
  if (text === undefined || text === '') return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

export function percentOf(level: number | null, capacity: number | null): number | null {
  if (level === null || level < 0) return null;
  if (capacity === null) return level <= 100 ? level : null;
  if (capacity <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((level / capacity) * 100)));
}
