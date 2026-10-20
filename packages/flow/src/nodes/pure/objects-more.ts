import type { JsonValue } from '@smarteverything/domain';
import type { Segment } from './objects';
import { child, safeKey, segmentsOf, valueAt } from './objects';
import type { JsonList, JsonRecord, PureBodies, PureBody } from './support';
import { describe, fail, isList, isRecord, isText, mismatch, outputs } from './support';

function without(node: JsonValue | undefined, segments: readonly Segment[]): JsonValue {
  const [segment, ...rest] = segments;
  if (segment === undefined || node === undefined) return node ?? null;
  if (typeof segment === 'number') {
    if (!isList(node)) return fail('TypeError', `${describe(node)} is not a list`);
    if (rest.length === 0) return node.filter((_, position) => position !== segment);
    return node.map((item, position) => (position === segment ? without(item, rest) : item));
  }
  if (!isRecord(node)) return fail('TypeError', `${describe(node)} is not a record`);
  if (rest.length === 0) {
    return Object.fromEntries(Object.entries(node).filter(([key]) => key !== segment));
  }
  return { ...node, [safeKey(segment)]: without(child(node, segment), rest) };
}

const remove: PureBody = (ports) => {
  const source = ports.need('source');
  const path = ports.text('path');
  if (valueAt(source, path) === undefined) {
    if (ports.flag('ignoreMissing')) return { record: source };
    return fail('NotFound', `${path} does not exist`);
  }
  return { record: without(source, segmentsOf(path)) };
};

function merged(left: JsonRecord, right: JsonRecord, deep: boolean): JsonRecord {
  const result: Record<string, JsonValue> = { ...left };
  for (const [key, value] of Object.entries(right)) {
    const existing = child(left, safeKey(key));
    result[key] =
      deep && isRecord(existing) && isRecord(value) ? merged(existing, value, true) : value;
  }
  return result;
}

const merge: PureBody = (ports) => {
  const deep = ports.flag('deep');
  const records = ports
    .list('records')
    .map((each, index) =>
      isRecord(each) ? each : mismatch(`record ${String(index + 1)}`, 'a record', each),
    );
  return { record: records.reduce<JsonRecord>((left, right) => merged(left, right, deep), {}) };
};

function entryOf(value: JsonValue, index: number): readonly [string, JsonValue] {
  const key = isRecord(value) ? value['key'] : undefined;
  const entry = isRecord(value) ? value['value'] : undefined;
  if (!isText(key) || entry === undefined) {
    return mismatch(`entry ${String(index + 1)}`, 'a record with a key and a value', value);
  }
  return [safeKey(key), entry];
}

const fields: PureBody = (ports) => {
  const source = ports.raw('source');
  const entries = ports.raw('entries');
  if ((source === undefined) === (entries === undefined)) {
    return fail('Invalid', 'fields needs either a record or entries, not both');
  }
  if (entries !== undefined) {
    if (!isList(entries)) return mismatch('entries', 'a list', entries);
    return { record: Object.fromEntries(entries.map(entryOf)) };
  }
  if (!isRecord(source)) return mismatch('source', 'a record', source);
  const pairs = Object.entries(source);
  return outputs({
    keys: pairs.map(([key]) => key),
    values: pairs.map(([, value]) => value),
    entries: pairs.map(([key, value]) => ({ key, value })),
  });
};

function names(list: JsonList): readonly string[] {
  return list.map((each, index) =>
    isText(each) ? each : mismatch(`key ${String(index + 1)}`, 'text', each),
  );
}

const pick: PureBody = (ports) => {
  const listed = names(ports.list('keys'));
  const mode = ports.text('mode');
  if (mode !== 'keep' && mode !== 'drop') return fail('Invalid', `${mode} is not keep or drop`);
  const record = ports.record('source');
  return {
    record: Object.fromEntries(
      Object.entries(record).filter(([key]) => listed.includes(key) === (mode === 'keep')),
    ),
  };
};

export const OBJECT_MORE_BODIES: PureBodies = {
  'object.remove': remove,
  'object.merge': merge,
  'object.fields': fields,
  'object.pick': pick,
};
