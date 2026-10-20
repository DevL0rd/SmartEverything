import { insideClockWindow, jsonEquals, localClock } from '@smarteverything/domain';
import type { JsonValue } from '@smarteverything/domain';
import { clockOf, instantOf, isClockText, isInstantText } from './moments';
import type { Ports, PureBodies, PureBody } from './support';
import {
  describe,
  fail,
  isFlag,
  isList,
  isNumber,
  isRecord,
  isText,
  mismatch,
  single,
} from './support';

export const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function textOrder(left: string, right: string, ignoreCase: boolean): number {
  if (isInstantText(left) && isInstantText(right))
    return Math.sign(Date.parse(left) - Date.parse(right));
  const a = ignoreCase ? left.toLowerCase() : left;
  const b = ignoreCase ? right.toLowerCase() : right;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function order(a: JsonValue, b: JsonValue, tolerance: number, ignoreCase: boolean): number {
  if (isNumber(a) && isNumber(b)) return Math.abs(a - b) <= tolerance ? 0 : Math.sign(a - b);
  if (isText(a) && isText(b)) return textOrder(a, b, ignoreCase);
  return fail('TypeError', `${describe(a)} and ${describe(b)} cannot be put in order`);
}

function kindOf(value: JsonValue): string {
  if (value === null) return 'nothing';
  if (isList(value)) return 'list';
  return typeof value;
}

const MISSING_HINT = 'use Has a value or First available to handle a missing value';

function sameKind(a: JsonValue, b: JsonValue): void {
  if (kindOf(a) === kindOf(b)) return;
  if (a === null) {
    fail(
      'TypeError',
      `the left value of the comparison is null and cannot be compared with ${describe(b)}; ${MISSING_HINT}`,
    );
  }
  if (b === null) {
    fail(
      'TypeError',
      `the right value of the comparison is null and cannot be compared with ${describe(a)}; ${MISSING_HINT}`,
    );
  }
  fail('TypeError', `${describe(a)} and ${describe(b)} are not the same kind of value`);
}

function equal(a: JsonValue, b: JsonValue, tolerance: number, ignoreCase: boolean): boolean {
  if ((isNumber(a) && isNumber(b)) || (isText(a) && isText(b))) {
    return order(a, b, tolerance, ignoreCase) === 0;
  }
  return jsonEquals(a, b);
}

interface Leniency {
  readonly tolerance: number;
  readonly fold: boolean;
}

function holds(op: string, a: JsonValue, b: JsonValue, { tolerance, fold }: Leniency): boolean {
  sameKind(a, b);
  if (op === 'eq') return equal(a, b, tolerance, fold);
  if (op === 'ne') return !equal(a, b, tolerance, fold);
  const sign = order(a, b, tolerance, fold);
  const table: Record<string, boolean> = {
    gt: sign > 0,
    gte: sign >= 0,
    lt: sign < 0,
    lte: sign <= 0,
  };
  return table[op] ?? fail('Invalid', `${op} is not a comparison`);
}

export function passes(test: string, value: JsonValue | undefined, against: JsonValue): boolean {
  return value !== undefined && holds(test, value, against, { tolerance: 0, fold: false });
}

function leniencyOf(ports: Ports): Leniency {
  return { tolerance: ports.maybeNumber('tolerance') ?? 0, fold: ports.flag('ignoreCase') };
}

const compare: PureBody = (ports) => {
  const a = ports.raw('a');
  if (a === undefined) {
    if (ports.flag('strict')) {
      return fail('NotFound', `the left value of the comparison is absent; ${MISSING_HINT}`);
    }
    return { result: false };
  }
  return { result: holds(ports.text('op'), a, ports.need('b'), leniencyOf(ports)) };
};

function inside(value: number, low: number, high: number, inclusive: boolean): boolean {
  const above = inclusive ? value >= low : value > low;
  const below = inclusive ? value <= high : value < high;
  return above && below;
}

function insideClock(value: number, low: number, high: number, inclusive: boolean): boolean {
  if (low <= high) return inside(value, low, high, inclusive);
  const late = inclusive ? value >= low : value > low;
  const early = inclusive ? value <= high : value < high;
  return late || early;
}

function ranged(value: number, low: number, high: number, inclusive: boolean): boolean {
  if (low > high) return fail('Invalid', 'the lower limit is above the upper limit');
  return inside(value, low, high, inclusive);
}

type Triple = readonly [JsonValue, JsonValue, JsonValue];

function allOf(triple: Triple, test: (value: JsonValue) => boolean): boolean {
  return triple.every(test);
}

function betweenClocks([value, low, high]: Triple, inclusive: boolean): boolean {
  const at = (clock: JsonValue): number => clockOf(clock, 'time of day');
  return insideClock(at(value), at(low), at(high), inclusive);
}

function betweenMoments([value, low, high]: Triple, inclusive: boolean): boolean {
  const at = (moment: JsonValue): number => instantOf(moment, 'moment');
  return ranged(at(value), at(low), at(high), inclusive);
}

function betweenAny(triple: Triple, inclusive: boolean): boolean {
  const [value, low, high] = triple;
  if (allOf(triple, isNumber)) {
    return ranged(Number(value), Number(low), Number(high), inclusive);
  }
  if (allOf(triple, isClockText)) return betweenClocks(triple, inclusive);
  if (allOf(triple, isInstantText)) return betweenMoments(triple, inclusive);
  return mismatch('value, min and max', 'all numbers, all moments or all times of day', value);
}

function tested(value: JsonValue | undefined): JsonValue {
  if (value === undefined) return fail('NotFound', `the value to test is absent; ${MISSING_HINT}`);
  if (value === null) return fail('TypeError', `the value to test is null; ${MISSING_HINT}`);
  return value;
}

const between: PureBody = (ports) => ({
  result: betweenAny(
    [tested(ports.raw('value')), ports.need('min'), ports.need('max')],
    ports.flag('inclusive'),
  ),
});

const isOneOf: PureBody = (ports) => {
  const value = ports.raw('value');
  if (value === undefined) return { result: false };
  const found = ports.list('list').some((item) => jsonEquals(item, value));
  return { result: found !== ports.flag('negate') };
};

export function flags(list: readonly JsonValue[]): readonly boolean[] {
  return list.map((item, index) =>
    isFlag(item) ? item : mismatch(`flag ${String(index + 1)}`, 'true or false', item),
  );
}

const TERMS = ['a', 'b', 'c', 'd'] as const;
const EXTRA_TERMS: ReadonlySet<string> = new Set(['c', 'd']);

function term(ports: Ports, name: string): boolean | undefined {
  if (!EXTRA_TERMS.has(name)) return ports.flag(name);
  const value = ports.raw(name);
  if (value === undefined) return undefined;
  return isFlag(value) ? value : mismatch(name, 'true or false', value);
}

const and: PureBody = (ports) => ({
  result: TERMS.every((name) => term(ports, name) !== false),
});

const or: PureBody = (ports) => ({
  result: TERMS.some((name) => term(ports, name) === true),
});

const not: PureBody = (ports) => ({ result: !ports.flag('flag') });

function isEmpty(value: JsonValue | undefined): boolean {
  if (value === undefined || value === null) return true;
  if (isText(value) || isList(value)) return value.length === 0;
  return isRecord(value) && Object.keys(value).length === 0;
}

const exists: PureBody = (ports) => {
  const value = ports.raw('value');
  const test = ports.text('test');
  if (test === 'is_null') return { result: value === null };
  if (test === 'is_empty') return { result: isEmpty(value) };
  return { result: value !== undefined && value !== null };
};

function firstPresent(ports: Ports): JsonValue | undefined {
  for (const name of TERMS) {
    const value = ports.raw(name);
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

const coalesce: PureBody = (ports) => {
  const value = firstPresent(ports) ?? ports.raw('default');
  return value === undefined
    ? fail('NotFound', ports.maybeText('message') ?? 'no value is available and no default is set')
    : { value };
};

const select: PureBody = (ports) =>
  single('value', ports.raw(ports.flag('condition') ? 'whenTrue' : 'whenFalse'));

const timeWindow: PureBody = (ports, environment) => {
  const at = ports.maybeText('at');
  const moment = at === undefined ? environment.now() : instantOf(at, 'at');
  const clock = localClock(new Date(moment), environment.timeZone);
  const days = ports.list('days');
  if (days.length > 0 && !days.includes(WEEKDAYS[clock.weekday] ?? '')) return { result: false };
  const from = ports.text('after');
  const to = ports.text('before');
  clockOf(from, 'after');
  clockOf(to, 'before');
  return { result: insideClockWindow({ from, to }, clock.minuteOfDay) };
};

const triggerIs: PureBody = (ports, environment) => ({
  result: environment.trigger() === ports.text('source'),
});

export const LOGIC_BODIES: PureBodies = {
  'logic.compare': compare,
  'logic.between': between,
  'logic.in': isOneOf,
  'logic.and': and,
  'logic.or': or,
  'logic.not': not,
  'logic.exists': exists,
  'logic.coalesce': coalesce,
  'logic.select': select,
  'logic.time_window': timeWindow,
  'logic.trigger_is': triggerIs,
};
