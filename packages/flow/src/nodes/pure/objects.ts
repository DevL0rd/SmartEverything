import { JSON_VALUE } from '@smarteverything/domain';
import type { JsonValue } from '@smarteverything/domain';
import type { JsonRecord, PureBodies, PureBody } from './support';
import { describe, fail, isList, isNumber, isRecord, isText } from './support';

export type Segment = string | number;

const SEGMENT = /\[(\d+)\]|([^.[\]]+)/g;
const PATH = /^(?:[^.[\]]+|\[\d+\])(?:\.[^.[\]]+|\[\d+\])*$/;
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function segmentsOf(path: string): readonly Segment[] {
  if (!PATH.test(path)) return fail('Invalid', `${path} is not a valid path`);
  return [...path.matchAll(SEGMENT)].map((match) =>
    match[1] === undefined ? (match[2] ?? '') : Number(match[1]),
  );
}

export function safeKey(key: string): string {
  return UNSAFE_KEYS.has(key) ? fail('Invalid', `${key} cannot be used as a field name`) : key;
}

export function child(node: JsonValue | undefined, segment: Segment): JsonValue | undefined {
  if (typeof segment === 'number') return isList(node) ? node[segment] : undefined;
  return isRecord(node) && Object.hasOwn(node, segment) ? node[segment] : undefined;
}

export function valueAt(source: JsonValue, path: string): JsonValue | undefined {
  let node: JsonValue | undefined = source;
  for (const segment of segmentsOf(path)) {
    node = child(node, segment);
    if (node === undefined) return undefined;
  }
  return node;
}

const get: PureBody = (ports) => {
  const path = ports.text('path');
  const found = valueAt(ports.need('source'), path);
  const value = found === undefined ? ports.raw('default') : found;
  return value === undefined ? fail('NotFound', `there is nothing at ${path}`) : { value };
};

function listWith(list: readonly JsonValue[], index: number, value: JsonValue): JsonValue {
  if (index > list.length) {
    return fail(
      'Invalid',
      `index ${String(index)} is beyond the end of a list of ${String(list.length)}`,
    );
  }
  return [...list.slice(0, index), value, ...list.slice(index + 1)];
}

function recordWith(record: JsonRecord, key: string, value: JsonValue): JsonValue {
  return { ...record, [safeKey(key)]: value };
}

function missing(path: string): never {
  return fail('NotFound', `${path} does not exist`);
}

function written(
  node: JsonValue | undefined,
  segments: readonly Segment[],
  value: JsonValue,
  create: boolean,
): JsonValue {
  const [segment, ...rest] = segments;
  if (segment === undefined) return value;
  const container =
    node ?? (create ? (typeof segment === 'number' ? [] : {}) : missing(String(segment)));
  const inner = (existing: JsonValue | undefined): JsonValue =>
    written(existing, rest, value, create);
  if (typeof segment === 'number') {
    if (!isList(container)) return fail('TypeError', `${describe(container)} is not a list`);
    return listWith(container, segment, inner(container[segment]));
  }
  if (!isRecord(container)) return fail('TypeError', `${describe(container)} is not a record`);
  return recordWith(container, segment, inner(child(container, segment)));
}

const set: PureBody = (ports) => ({
  record: written(
    ports.need('source'),
    segmentsOf(ports.text('path')),
    ports.need('value'),
    ports.flag('create'),
  ),
});

const SHAPE_TYPES: Readonly<Record<string, (value: JsonValue | undefined) => boolean>> = {
  number: isNumber,
  text: isText,
  boolean: (value) => typeof value === 'boolean',
  list: isList,
  record: isRecord,
  any: (value) => value !== undefined,
};

function checkShape(json: JsonValue, shape: string): void {
  for (const field of shape
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')) {
    const [name = '', type = 'any'] = field.split(':').map((part) => part.trim());
    const holds = SHAPE_TYPES[type] ?? fail('Invalid', `${type} is not a shape type`);
    if (!holds(child(json, name))) fail('Invalid', `the JSON has no ${type} field ${name}`);
  }
}

function parsed(text: string): JsonValue {
  try {
    return JSON_VALUE.parse(JSON.parse(text));
  } catch (error) {
    return fail('Invalid', error instanceof Error ? error.message : 'the text is not JSON');
  }
}

const parseJson: PureBody = (ports) => {
  const json = parsed(ports.text('text'));
  const shape = ports.maybeText('shape');
  if (shape !== undefined) checkShape(json, shape);
  return { json, ok: true };
};

const toJson: PureBody = (ports) => ({
  text: JSON.stringify(ports.need('value'), null, ports.flag('pretty') ? 2 : undefined),
});

const make: PureBody = (ports) => {
  const fields = ports.record('fields');
  Object.keys(fields).forEach(safeKey);
  return { record: fields };
};

export const OBJECT_BODIES: PureBodies = {
  'object.make': make,
  'object.get': get,
  'object.set': set,
  'object.parse_json': parseJson,
  'object.to_json': toJson,
};
