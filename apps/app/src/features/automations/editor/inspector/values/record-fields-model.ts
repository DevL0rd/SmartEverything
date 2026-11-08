import type { FlowType, JsonValue, PortValue, Wire } from '@smarteverything/domain';

export type RecordFields =
  | { readonly t: 'fields'; readonly fields: readonly string[] }
  | { readonly t: 'none'; readonly reason: string };

export const NO_RECORD = 'Set or wire the list or record first';
export const UNKNOWN_FIELDS = 'The wired value does not say which fields it has';
export const NO_FIELDS = 'The value has no fields to pick yet';

type RecordType = Extract<FlowType, { readonly t: 'record' }>;

type FieldTree = ReadonlyMap<string, FieldTree | null>;

function unwrap(type: FlowType): FlowType {
  return type.t === 'optional' ? unwrap(type.of) : type;
}

function recordShape(type: FlowType): RecordType | undefined {
  const inner = unwrap(type);
  return inner.t === 'record' && inner.fields !== undefined ? inner : undefined;
}

function treeOfType(record: RecordType): FieldTree {
  return new Map(
    Object.entries(record.fields ?? {}).map(([name, type]) => {
      const nested = recordShape(type);
      return [name, nested === undefined ? null : treeOfType(nested)] as const;
    }),
  );
}

function isRecord(value: JsonValue): value is Readonly<Record<string, JsonValue>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function treeOfRecords(records: readonly Readonly<Record<string, JsonValue>>[]): FieldTree {
  const names = [...new Set(records.flatMap((record) => Object.keys(record)))];
  return new Map(
    names.map((name) => {
      const nested = records.flatMap((record) => {
        const child = record[name];
        return child !== undefined && isRecord(child) ? [child] : [];
      });
      return [name, nested.length === 0 ? null : treeOfRecords(nested)] as const;
    }),
  );
}

function paths(tree: FieldTree, deep: boolean, prefix = ''): readonly string[] {
  return [...tree].flatMap(([name, nested]) => {
    const path = `${prefix}${name}`;
    return deep && nested !== null ? [path, ...paths(nested, deep, `${path}.`)] : [path];
  });
}

function treeOfLiteral(value: JsonValue): { readonly tree: FieldTree; readonly list: boolean } {
  if (Array.isArray(value)) return { tree: treeOfRecords(value.filter(isRecord)), list: true };
  return { tree: isRecord(value) ? treeOfRecords([value]) : new Map(), list: false };
}

function treeOfWired(type: FlowType): { readonly tree: FieldTree; readonly list: boolean } | null {
  const inner = unwrap(type);
  const list = inner.t === 'list';
  const shape = recordShape(list ? inner.of : inner);
  return shape === undefined ? null : { tree: treeOfType(shape), list };
}

export function recordFieldsOf(
  value: PortValue | undefined,
  typeOfWire: (wire: Wire) => FlowType,
  multiple: boolean,
): RecordFields {
  if (value === undefined) return { t: 'none', reason: NO_RECORD };
  const found = 'lit' in value ? treeOfLiteral(value.lit) : treeOfWired(typeOfWire(value.wire));
  if (found === null) return { t: 'none', reason: UNKNOWN_FIELDS };
  if (found.tree.size === 0) return { t: 'none', reason: NO_FIELDS };
  return { t: 'fields', fields: paths(found.tree, !found.list && !multiple) };
}
