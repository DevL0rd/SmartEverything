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

interface DroppedRows {
  readonly table: string;
  readonly count: number;
  readonly reason: string;
}

export type ReadableTables<T> =
  | {
      readonly ok: true;
      readonly data: T;
      readonly ignored: readonly string[];
      readonly skipped: readonly string[];
      readonly dropped: readonly DroppedRows[];
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

interface Address {
  readonly table: string;
  readonly row: number | null;
  readonly reason: string;
}

function addressOf(issue: Issue, roots: readonly string[]): Address | null {
  const [root, table, row] = issue.path;
  if (typeof root !== 'string' || !roots.includes(root) || typeof table !== 'string') {
    return null;
  }
  return {
    table: `${root}.${table}`,
    row: typeof row === 'number' ? row : null,
    reason: `${issue.path.slice(2).join('.') || 'value'} ${issue.message}`,
  };
}

function addressesOf(error: z.ZodError, roots: readonly string[]): readonly Address[] | null {
  const found = error.issues.map((issue) => addressOf(issue, roots));
  return found.every((address) => address !== null) ? found : null;
}

function withoutTable(value: unknown, table: string): unknown {
  const [root = '', name = ''] = table.split('.');
  if (!isRecord(value) || !isRecord(value[root])) {
    return value;
  }
  const { [name]: dropped, ...kept } = value[root];
  return { ...value, [root]: Array.isArray(dropped) ? { ...kept, [name]: [] } : kept };
}

function withoutRows(value: unknown, table: string, rows: ReadonlySet<number>): unknown {
  const [root = '', name = ''] = table.split('.');
  if (!isRecord(value) || !isRecord(value[root])) {
    return value;
  }
  const list = value[root][name];
  if (!Array.isArray(list)) {
    return value;
  }
  return {
    ...value,
    [root]: { ...value[root], [name]: list.filter((_row: unknown, index) => !rows.has(index)) },
  };
}

interface Trimmed {
  readonly value: unknown;
  readonly skipped: Set<string>;
  readonly dropped: Map<string, { rows: Set<number>; reason: string }>;
}

function trimmed(value: unknown, addresses: readonly Address[], into: Trimmed): Trimmed {
  const rowsOf = new Map<string, Set<number>>();
  let current = value;
  for (const address of addresses) {
    if (address.row === null || !Array.isArray(rowListOf(value, address.table))) {
      current = withoutTable(current, address.table);
      into.skipped.add(address.table);
      continue;
    }
    const rows = rowsOf.get(address.table) ?? new Set<number>();
    rows.add(address.row);
    rowsOf.set(address.table, rows);
    const entry = into.dropped.get(address.table) ?? {
      rows: new Set<number>(),
      reason: address.reason,
    };
    entry.rows.add(address.row);
    into.dropped.set(address.table, entry);
  }
  for (const [table, rows] of rowsOf) {
    current = withoutRows(current, table, rows);
    into.skipped.add(table);
  }
  return { ...into, value: current };
}

function rowListOf(value: unknown, table: string): unknown {
  const [root = '', name = ''] = table.split('.');
  return isRecord(value) && isRecord(value[root]) ? value[root][name] : undefined;
}

const TABLE_ROUNDS = 4;

export function readTablesLeniently<S extends z.ZodType>(
  schema: S,
  value: unknown,
  roots: readonly string[],
): ReadableTables<z.output<S>> {
  let state: Trimmed = { value, skipped: new Set(), dropped: new Map() };
  let read = readLeniently(schema, state.value);
  for (let round = 0; round < TABLE_ROUNDS && !read.ok; round += 1) {
    const addresses = addressesOf(read.error, roots);
    if (addresses === null) {
      return read;
    }
    state = trimmed(state.value, addresses, state);
    read = readLeniently(schema, state.value);
  }
  if (!read.ok) {
    return read;
  }
  return {
    ...read,
    skipped: [...state.skipped],
    dropped: [...state.dropped].map(([table, entry]) => ({
      table,
      count: entry.rows.size,
      reason: entry.reason,
    })),
  };
}
