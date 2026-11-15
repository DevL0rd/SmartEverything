import { z } from 'zod';

type Issue = z.core.$ZodIssue;

type Key = PropertyKey;

interface Removal {
  readonly path: readonly Key[];
  readonly keys: readonly string[];
}

export type Readable<T> =
  | { readonly ok: true; readonly data: T; readonly ignored: readonly string[] }
  | { readonly ok: false; readonly error: z.ZodError };

export interface SectionFailure {
  readonly section: string;
  readonly reason: string;
}

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
      readonly dropped: readonly DroppedRows[];
      readonly failed: readonly SectionFailure[];
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
  readonly list: boolean;
  readonly whole: boolean;
}

function pathText(path: readonly Key[]): string {
  return path.map(String).join('.');
}

function expectsList(issue: Issue): boolean {
  return issue.code === 'invalid_type' && issue.expected === 'array';
}

function addressOf(
  issue: Issue,
  value: unknown,
  roots: readonly string[],
  sections: readonly string[],
): Address | null {
  const [root, table, row] = issue.path;
  if (typeof root === 'string' && sections.includes(root)) {
    return {
      table: root,
      row: null,
      reason: `${pathText(issue.path)} ${issue.message}`,
      list: false,
      whole: true,
    };
  }
  if (typeof root !== 'string' || !roots.includes(root) || typeof table !== 'string') {
    return null;
  }
  return tableAddress(issue, value, `${root}.${table}`, row);
}

function tableAddress(issue: Issue, value: unknown, name: string, row: Key | undefined): Address {
  const missing = issue.path.length === 2 && rowListOf(value, name) === undefined;
  return {
    table: name,
    row: typeof row === 'number' ? row : null,
    reason: missing
      ? 'the server did not send this table'
      : `${pathText(issue.path.slice(2)) || 'value'} ${issue.message}`,
    list: issue.path.length === 2 && expectsList(issue),
    whole: false,
  };
}

function addressesOf(
  error: z.ZodError,
  value: unknown,
  roots: readonly string[],
  sections: readonly string[],
): readonly Address[] | null {
  const found = error.issues.map((issue) => addressOf(issue, value, roots, sections));
  return found.every((address) => address !== null) ? found : null;
}

function withoutSection(value: unknown, section: string): unknown {
  return isRecord(value) ? { ...value, [section]: null } : value;
}

function withoutTable(value: unknown, table: string, list: boolean): unknown {
  const [root = '', name = ''] = table.split('.');
  if (!isRecord(value) || !isRecord(value[root])) {
    return value;
  }
  const { [name]: dropped, ...kept } = value[root];
  return { ...value, [root]: Array.isArray(dropped) || list ? { ...kept, [name]: [] } : kept };
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
  readonly dropped: Map<string, { rows: Set<number>; reason: string }>;
  readonly failed: Map<string, string>;
}

function noteFailure(into: Trimmed, section: string, reason: string): void {
  if (!into.failed.has(section)) {
    into.failed.set(section, reason);
  }
}

function trimmed(value: unknown, addresses: readonly Address[], into: Trimmed): Trimmed {
  const rowsOf = new Map<string, Set<number>>();
  let current = value;
  for (const address of addresses) {
    if (address.whole) {
      current = withoutSection(current, address.table);
      noteFailure(into, address.table, address.reason);
      continue;
    }
    if (address.row === null || !Array.isArray(rowListOf(value, address.table))) {
      current = withoutTable(current, address.table, address.list);
      noteFailure(into, address.table, address.reason);
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
  }
  return { ...into, value: current };
}

function rowListOf(value: unknown, table: string): unknown {
  const [root = '', name = ''] = table.split('.');
  return isRecord(value) && isRecord(value[root]) ? value[root][name] : undefined;
}

function shapeOf(schema: z.core.$ZodType): Readonly<Record<string, z.core.$ZodType>> | null {
  if (schema instanceof z.ZodObject) {
    return schema.shape;
  }
  if (schema instanceof z.ZodNullable || schema instanceof z.ZodOptional) {
    return shapeOf(schema.unwrap());
  }
  return null;
}

function unknownKeys(shape: Readonly<Record<string, z.core.$ZodType>>, value: unknown): string[] {
  return isRecord(value) ? Object.keys(value).filter((key) => !(key in shape)) : [];
}

function unknownSections(
  schema: z.ZodType,
  value: unknown,
  roots: readonly string[],
): readonly SectionFailure[] {
  const shape = shapeOf(schema);
  if (shape === null || !isRecord(value)) {
    return [];
  }
  const top = unknownKeys(shape, value).map((section) => ({
    section,
    reason: 'this app does not know this section',
  }));
  const tables = roots.flatMap((root) => {
    const inner = shape[root];
    const innerShape = inner === undefined ? null : shapeOf(inner);
    return innerShape === null
      ? []
      : unknownKeys(innerShape, value[root]).map((table) => ({
          section: `${root}.${table}`,
          reason: 'this app does not know this table',
        }));
  });
  return [...top, ...tables];
}

const TABLE_ROUNDS = 4;

export function readTablesLeniently<S extends z.ZodType>(
  schema: S,
  value: unknown,
  roots: readonly string[],
  sections: readonly string[] = [],
): ReadableTables<z.output<S>> {
  let state: Trimmed = { value, dropped: new Map(), failed: new Map() };
  let read = readLeniently(schema, state.value);
  for (let round = 0; round < TABLE_ROUNDS && !read.ok; round += 1) {
    const addresses = addressesOf(read.error, state.value, roots, sections);
    if (addresses === null) {
      return read;
    }
    state = trimmed(state.value, addresses, state);
    read = readLeniently(schema, state.value);
  }
  if (!read.ok) {
    return read;
  }
  const dropped = [...state.dropped].map(([table, entry]) => ({
    table,
    count: entry.rows.size,
    reason: entry.reason,
  }));
  dropped.forEach((rows) => {
    noteFailure(
      state,
      rows.table,
      `${String(rows.count)} unreadable ${rows.count === 1 ? 'row' : 'rows'}: ${rows.reason}`,
    );
  });
  unknownSections(schema, value, roots).forEach((failure) => {
    noteFailure(state, failure.section, failure.reason);
  });
  return {
    ...read,
    dropped,
    failed: [...state.failed].map(([section, reason]) => ({ section, reason })),
  };
}
