import type { z } from 'zod';

type Issue = z.core.$ZodIssue;

type Key = PropertyKey;

interface Removal {
  readonly path: readonly Key[];
  readonly keys: readonly string[];
}

export type Readable<T> =
  | { readonly ok: true; readonly data: T; readonly ignored: readonly string[] }
  | { readonly ok: false; readonly error: z.ZodError };

export type ReadableTables<T> =
  | {
      readonly ok: true;
      readonly data: T;
      readonly ignored: readonly string[];
      readonly skipped: readonly string[];
    }
  | { readonly ok: false; readonly error: z.ZodError };

const ROUNDS = 8;

function unionRemovals(issue: Issue, path: readonly Key[]): Removal[] | null {
  if (issue.code !== 'invalid_union') {
    return null;
  }
  for (const branch of issue.errors) {
    const found = removalsOf(branch, path);
    if (found !== null) {
      return found;
    }
  }
  return null;
}

function removalsOf(issues: readonly Issue[], base: readonly Key[]): Removal[] | null {
  const found: Removal[] = [];
  for (const issue of issues) {
    const path = [...base, ...issue.path];
    if (issue.code === 'unrecognized_keys') {
      found.push({ path, keys: issue.keys });
      continue;
    }
    const inner = unionRemovals(issue, path);
    if (inner === null) {
      return null;
    }
    found.push(...inner);
  }
  return found;
}

function strippable(issues: readonly Issue[]): Removal[] {
  return issues.flatMap((issue) => removalsOf([issue], []) ?? []);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function withoutKeys(value: unknown, path: readonly Key[], keys: readonly string[]): unknown {
  const [head, ...rest] = path;
  if (Array.isArray(value)) {
    return value.map((item: unknown, index) =>
      index === head ? withoutKeys(item, rest, keys) : item,
    );
  }
  if (!isRecord(value)) {
    return value;
  }
  if (head === undefined) {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
  }
  const field = String(head);
  return { ...value, [field]: withoutKeys(value[field], rest, keys) };
}

function textOf(path: readonly Key[], key: string): string {
  return [...path.map(String), key].join('.');
}

function stripRound(value: unknown, issues: readonly Issue[], ignored: string[]): unknown {
  const removals = strippable(issues);
  if (removals.length === 0) {
    return null;
  }
  return removals.reduce((current, removal) => {
    ignored.push(...removal.keys.map((key) => textOf(removal.path, key)));
    return withoutKeys(current, removal.path, removal.keys);
  }, value);
}

export function readLeniently<S extends z.ZodType>(
  schema: S,
  value: unknown,
): Readable<z.output<S>> {
  const ignored: string[] = [];
  let current = value;
  let parsed = schema.safeParse(current);
  for (let round = 0; round < ROUNDS && !parsed.success; round += 1) {
    const next = stripRound(current, parsed.error.issues, ignored);
    if (next === null) {
      return { ok: false, error: parsed.error };
    }
    current = next;
    parsed = schema.safeParse(current);
  }
  return parsed.success
    ? { ok: true, data: parsed.data, ignored }
    : { ok: false, error: parsed.error };
}

function tablesIn(error: z.ZodError, roots: readonly string[]): readonly string[] | null {
  const tables = error.issues.map((issue) => {
    const [root, table] = issue.path;
    return typeof root === 'string' && roots.includes(root) && typeof table === 'string'
      ? `${root}.${table}`
      : null;
  });
  return tables.every((table) => table !== null) ? [...new Set(tables)] : null;
}

function withoutTable(value: unknown, table: string): unknown {
  const [root = '', name = ''] = table.split('.');
  if (!isRecord(value) || !isRecord(value[root])) {
    return value;
  }
  const { [name]: dropped, ...kept } = value[root];
  return { ...value, [root]: Array.isArray(dropped) ? { ...kept, [name]: [] } : kept };
}

export function readTablesLeniently<S extends z.ZodType>(
  schema: S,
  value: unknown,
  roots: readonly string[],
): ReadableTables<z.output<S>> {
  const first = readLeniently(schema, value);
  if (first.ok) {
    return { ...first, skipped: [] };
  }
  const tables = tablesIn(first.error, roots);
  if (tables === null) {
    return first;
  }
  const rest = readLeniently(schema, tables.reduce(withoutTable, value));
  return rest.ok ? { ...rest, skipped: tables } : rest;
}
