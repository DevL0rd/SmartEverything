import { LIST_RANGE_LIMIT, jsonEquals } from '@smarteverything/domain';
import type { JsonValue } from '@smarteverything/domain';
import type { JsonList, Ports, PureBodies, PureBody } from './support';
import { fail, isList, isNumber, isRecord, isText, mismatch } from './support';

const RANGE_TOLERANCE = 1e-9;

function keysOf(list: JsonList, field: string | undefined): readonly JsonValue[] {
  if (field === undefined) return list;
  return list.map((item, index) => {
    const key = isRecord(item) && Object.hasOwn(item, field) ? item[field] : undefined;
    return key ?? fail('NotFound', `item ${String(index + 1)} has no field ${field}`);
  });
}

function collatorFor(natural: boolean): (a: string, b: string) => number {
  const collator = new Intl.Collator('en', { numeric: true });
  if (natural) return (a, b) => collator.compare(a, b);
  return (a, b) => (a === b ? 0 : a < b ? -1 : 1);
}

function comparer(natural: boolean): (a: JsonValue, b: JsonValue) => number {
  const text = collatorFor(natural);
  return (a, b) => {
    if (isNumber(a) && isNumber(b)) return a - b;
    if (isText(a) && isText(b)) return text(a, b);
    return fail(
      'TypeError',
      `${JSON.stringify(a)} and ${JSON.stringify(b)} cannot be put in order`,
    );
  };
}

const sort: PureBody = (ports) => {
  const list = ports.list('list');
  const keys = keysOf(list, ports.maybeText('field'));
  const compare = comparer(ports.flag('natural'));
  const sign = ports.text('direction') === 'descending' ? -1 : 1;
  const order = list
    .map((_, position) => position)
    .sort((x, y) => sign * compare(keys[x] ?? null, keys[y] ?? null));
  return { list: order.map((position) => list[position] ?? null) };
};

function distinct(values: JsonList): readonly number[] {
  const kept: number[] = [];
  values.forEach((value, position) => {
    if (!kept.some((earlier) => jsonEquals(values[earlier] ?? null, value))) kept.push(position);
  });
  return kept;
}

const unique: PureBody = (ports) => {
  const list = ports.list('list');
  const kept = distinct(keysOf(list, ports.maybeText('field')));
  return {
    list: kept.map((position) => list[position] ?? null),
    removed: list.length - kept.length,
  };
};

function wholeNumber(value: number | undefined, label: string): number | undefined {
  if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
    return fail('Invalid', `${label} must be a whole number of at least 0`);
  }
  return value;
}

const slice: PureBody = (ports) => {
  const list = ports.list('list');
  const take = ports.text('take');
  const count = wholeNumber(ports.maybeNumber('count'), 'count');
  if (take === 'range') {
    const from = ports.number('from');
    if (!Number.isInteger(from)) return fail('Invalid', 'from must be a whole number');
    const start = Math.max(0, from < 0 ? list.length + from : from);
    return { list: list.slice(start, count === undefined ? undefined : start + count) };
  }
  if (count === undefined) return fail('Invalid', `taking the ${take} items needs a count`);
  if (take === 'first') return { list: list.slice(0, count) };
  if (take !== 'last') return fail('Invalid', `${take} is not a way to take part of a list`);
  return { list: count === 0 ? [] : list.slice(-count) };
};

function listsOf(ports: Ports): readonly JsonList[] {
  return ports
    .list('lists')
    .map((each, index) =>
      isList(each) ? each : mismatch(`list ${String(index + 1)}`, 'a list', each),
    );
}

function within(list: JsonList, value: JsonValue): boolean {
  return list.some((item) => jsonEquals(item, value));
}

function uniqueOf(list: JsonList): JsonList {
  return distinct(list).map((position) => list[position] ?? null);
}

const COMBINERS: Readonly<Record<string, (lists: readonly JsonList[]) => JsonList>> = {
  concat: (lists) => lists.flat(),
  union: (lists) => uniqueOf(lists.flat()),
  intersect: ([first = [], ...rest]) =>
    uniqueOf(first).filter((value) => rest.every((other) => within(other, value))),
  difference: ([first = [], ...rest]) =>
    uniqueOf(first).filter((value) => !rest.some((other) => within(other, value))),
};

const combine: PureBody = (ports) => {
  const mode = ports.text('mode');
  const combiner = COMBINERS[mode] ?? fail('Invalid', `${mode} is not a way to combine lists`);
  return { list: combiner(listsOf(ports)) };
};

function chunked(list: JsonList, size: number): JsonList {
  if (!Number.isInteger(size) || size < 1)
    return fail('Invalid', 'the chunk size must be a whole number from 1');
  return Array.from({ length: Math.ceil(list.length / size) }, (_, at) =>
    list.slice(at * size, (at + 1) * size),
  );
}

function paired(list: JsonList, other: JsonValue | undefined): JsonList {
  if (!isList(other)) return fail('Invalid', 'pairing needs a second list');
  return list
    .slice(0, Math.min(list.length, other.length))
    .map((item, at) => [item, other[at] ?? null]);
}

const reshape: PureBody = (ports) => {
  const list = ports.list('list');
  const op = ports.text('op');
  if (op === 'reverse') return { list: [...list].reverse() };
  if (op === 'flatten') return { list: list.flatMap((item) => (isList(item) ? item : [item])) };
  if (op === 'chunk') return { list: chunked(list, ports.number('size')) };
  if (op === 'zip') return { list: paired(list, ports.raw('other')) };
  return fail('Invalid', `${op} is not a way to reshape a list`);
};

const range: PureBody = (ports) => {
  const from = ports.number('from');
  const to = ports.number('to');
  const size = Math.abs(ports.number('step'));
  if (size === 0) return fail('Invalid', 'the step of the range must not be 0');
  const count = Math.floor(Math.abs(to - from) / size + RANGE_TOLERANCE) + 1;
  if (count > LIST_RANGE_LIMIT) {
    return fail(
      'LimitExceeded',
      `the range has ${String(count)} numbers, above ${String(LIST_RANGE_LIMIT)}`,
    );
  }
  const signed = to >= from ? size : -size;
  return {
    list: Array.from({ length: count }, (_, at) => Number((from + at * signed).toPrecision(12))),
  };
};

export const LIST_MORE_BODIES: PureBodies = {
  'list.sort': sort,
  'list.unique': unique,
  'list.slice': slice,
  'list.combine': combine,
  'list.reshape': reshape,
  'list.range': range,
};
