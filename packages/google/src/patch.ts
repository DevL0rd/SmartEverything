import { fieldNames, present, valuesEqual, type FieldMap } from './fields';

export interface FieldPatch {
  readonly body: Readonly<Record<string, unknown>>;
  readonly headers: Readonly<Record<string, string>>;
  readonly changed: readonly string[];
}

export interface PatchInput {
  readonly etag: string;
  readonly base: FieldMap;
  readonly next: FieldMap;
  readonly fields: readonly string[];
}

export function buildFieldPatch(input: PatchInput): FieldPatch | null {
  const allowed = new Set(input.fields);
  const body: Record<string, unknown> = {};
  const changed: string[] = [];
  for (const name of fieldNames(input.base, input.next)) {
    if (!allowed.has(name)) continue;
    const before = present(input.base, name);
    const after = present(input.next, name);
    if (valuesEqual(before, after)) continue;
    body[name] = after === undefined ? null : after;
    changed.push(name);
  }
  if (changed.length === 0) return null;
  return {
    body,
    headers: { 'If-Match': input.etag, 'Content-Type': 'application/json' },
    changed,
  };
}
