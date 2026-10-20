import { jsonEquals } from '@smarteverything/domain';
import type { JsonValue } from '@smarteverything/domain';
import { passes } from './logic';
import type { JsonList, Ports, PureBodies, PureBody } from './support';
import { fail, isRecord, outputs } from './support';

function whole(index: number, label: string): number {
  return Number.isInteger(index) ? index : fail('Invalid', `${label} must be a whole number`);
}

function resolved(length: number, index: number): number | undefined {
  const at = index < 0 ? length + index : index;
  return at >= 0 && at < length ? at : undefined;
}

function chosen(list: JsonList, position: string, index: number): number | undefined {
  if (position === 'first') return resolved(list.length, 0);
  if (position === 'last') return resolved(list.length, -1);
  return resolved(list.length, whole(index, 'index'));
}

const make: PureBody = (ports) => ({ list: ports.list('items') });

const get: PureBody = (ports) => {
  const list = ports.list('list');
  const at = chosen(list, ports.text('position'), ports.number('index'));
  const item = at === undefined ? ports.raw('default') : list[at];
  if (item === undefined)
    return fail('NotFound', `the list has no item there (length ${String(list.length)})`);
  return { item, length: list.length };
};

const length: PureBody = (ports) => ({ length: ports.list('list').length });

function inserted(list: JsonList, item: JsonValue, at: string, index: number): JsonList {
  if (at === 'start') return [item, ...list];
  if (at === 'end') return [...list, item];
  const where = whole(index, 'index');
  if (where < 0 || where > list.length) {
    return fail('Invalid', `index ${String(where)} is outside 0 to ${String(list.length)}`);
  }
  return [...list.slice(0, where), item, ...list.slice(where)];
}

const add: PureBody = (ports) => ({
  list: inserted(ports.list('list'), ports.need('item'), ports.text('at'), ports.number('index')),
});

function removedAt(list: JsonList, index: number): JsonList {
  const at = resolved(list.length, whole(index, 'index'));
  if (at === undefined) return fail('NotFound', `the list has no item at ${String(index)}`);
  return list.filter((_, position) => position !== at);
}

function removedValue(list: JsonList, value: JsonValue, all: boolean): JsonList {
  const first = list.findIndex((item) => jsonEquals(item, value));
  if (all) return list.filter((item) => !jsonEquals(item, value));
  return list.filter((_, position) => position !== first);
}

const remove: PureBody = (ports) => {
  const list = ports.list('list');
  const by = ports.text('by');
  if (by === 'index') return { list: removedAt(list, ports.number('index')) };
  return { list: removedValue(list, ports.need('value'), by === 'all') };
};

function fieldOf(item: JsonValue, field: string): JsonValue | undefined {
  return isRecord(item) && Object.hasOwn(item, field) ? item[field] : undefined;
}

function itemTest(ports: Ports): (item: JsonValue) => boolean {
  const field = ports.maybeText('field');
  const test = ports.text('test');
  const against = ports.need('value');
  return (item) => passes(test, field === undefined ? item : fieldOf(item, field), against);
}

const filter: PureBody = (ports) => {
  const list = ports.list('list');
  const test = itemTest(ports);
  const kept = list.filter(test);
  return { kept, rejected: list.filter((item) => !test(item)), count: kept.length };
};

const find: PureBody = (ports) => {
  const list = ports.list('list');
  const index = list.findIndex(itemTest(ports));
  if (index < 0) return { found: false };
  return outputs({ found: true, item: list[index], index });
};

const any: PureBody = (ports) => ({ result: ports.list('list').some(itemTest(ports)) });

const all: PureBody = (ports) => ({ result: ports.list('list').every(itemTest(ports)) });

const field: PureBody = (ports) => {
  const name = ports.text('field');
  const list = ports.list('list').map((item, index) => {
    const value = fieldOf(item, name);
    return value ?? fail('NotFound', `item ${String(index + 1)} has no field ${name}`);
  });
  return { list };
};

function stepped(count: number, from: number, direction: string, edge: string): number {
  const delta = direction === 'previous' ? -1 : 1;
  const target = from + delta;
  if (target >= 0 && target < count) return target;
  if (edge === 'stop') return from;
  return (target + count) % count;
}

const cycle: PureBody = (ports) => {
  const list = ports.list('list');
  if (list.length === 0) return fail('Invalid', 'there are no items to cycle through');
  const current = ports.need('current');
  const from = list.findIndex((item) => jsonEquals(item, current));
  const index =
    from < 0 ? 0 : stepped(list.length, from, ports.text('direction'), ports.text('edge'));
  return { next: list[index] ?? null, index };
};

export const LIST_BODIES: PureBodies = {
  'list.make': make,
  'list.get': get,
  'list.length': length,
  'list.add': add,
  'list.remove': remove,
  'list.filter': filter,
  'list.find': find,
  'list.any': any,
  'list.all': all,
  'list.field': field,
  'list.cycle': cycle,
};
