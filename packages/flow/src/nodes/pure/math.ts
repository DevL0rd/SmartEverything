import type { JsonValue } from '@smarteverything/domain';
import { instantOf, isInstantText, isoOf } from './moments';
import type { Ports, PureBodies, PureBody } from './support';
import { fail, finite, isNumber, mismatch, numbersOf, outputs } from './support';

function sum(values: readonly number[]): number {
  return finite(
    values.reduce((total, value) => total + value, 0),
    'the sum',
  );
}

function addTerms(values: readonly JsonValue[]): string | number {
  const moments = values.filter(isInstantText);
  if (moments.length === 0) return sum(numbersOf(values, 'values'));
  if (moments.length > 1) return fail('TypeError', 'only one moment can be added to durations');
  const rest = values.filter((value) => !isInstantText(value));
  return isoOf(instantOf(moments[0], 'moment') + sum(numbersOf(rest, 'durations')));
}

const EXTRA_TERMS = ['c', 'd'] as const;

function terms(ports: Ports): readonly JsonValue[] {
  const extra = EXTRA_TERMS.flatMap((name) => {
    const value = ports.raw(name);
    return value === undefined ? [] : [value];
  });
  return [ports.need('a'), ports.need('b'), ...extra];
}

const add: PureBody = (ports) => ({ result: addTerms(terms(ports)) });

function subtract(a: JsonValue, b: JsonValue): string | number {
  if (isInstantText(a) && isInstantText(b)) return instantOf(a, 'a') - instantOf(b, 'b');
  if (isInstantText(a) && isNumber(b)) return isoOf(instantOf(a, 'a') - b);
  if (isNumber(a) && isNumber(b)) return finite(a - b, 'the difference');
  return mismatch('a and b', 'two numbers, two moments or a moment and a duration', a);
}

const subtractBody: PureBody = (ports) => ({ result: subtract(ports.need('a'), ports.need('b')) });

const multiply: PureBody = (ports) => ({
  result: finite(
    numbersOf(terms(ports), 'values').reduce((total, value) => total * value, 1),
    'the product',
  ),
});

function divisor(value: number, operation: string): number {
  return value === 0 ? fail('MathError', `${operation} by zero`) : value;
}

const divide: PureBody = (ports) => {
  const quotient = ports.number('a') / divisor(ports.number('b'), 'division');
  return {
    result: finite(ports.flag('integer') ? Math.floor(quotient) : quotient, 'the quotient'),
  };
};

const modulo: PureBody = (ports) => {
  const b = divisor(ports.number('b'), 'remainder');
  return { result: finite(((ports.number('a') % b) + b) % b, 'the remainder') };
};

function shifted(value: number, places: number): number {
  const [mantissa = '0', exponent = '0'] = String(value).split('e');
  return Number(`${mantissa}e${String(Number(exponent) + places)}`);
}

function plain(value: number): number {
  return value === 0 ? 0 : value;
}

function away(value: number): number {
  return plain(Math.sign(value) * Math.round(Math.abs(value)));
}

const ROUNDING: Readonly<Record<string, (value: number) => number>> = {
  round: away,
  floor: Math.floor,
  ceil: Math.ceil,
  trunc: Math.trunc,
};

function rounder(mode: string): (value: number) => number {
  return ROUNDING[mode] ?? fail('Invalid', `${mode} is not a rounding mode`);
}

function roundedTo(value: number, places: number, apply: (value: number) => number): number {
  return plain(shifted(apply(shifted(value, places)), -places));
}

function roundedStep(value: number, step: number, apply: (value: number) => number): number {
  if (step <= 0) return fail('Invalid', 'the step must be above zero');
  return plain(Number((apply(value / step) * step).toPrecision(15)));
}

const round: PureBody = (ports) => {
  const value = ports.number('value');
  const apply = rounder(ports.text('mode'));
  const step = ports.maybeNumber('toStep');
  if (step !== undefined) return { result: roundedStep(value, step, apply) };
  const places = ports.number('places');
  if (!Number.isInteger(places) || places < -6 || places > 10) {
    return fail('Invalid', 'places must be a whole number from -6 to 10');
  }
  return { result: roundedTo(value, places, apply) };
};

const minMax: PureBody = (ports) => {
  const values = numbersOf(ports.list('values'), 'values');
  if (values.length === 0) return fail('Invalid', 'there are no numbers to pick from');
  return { result: ports.text('op') === 'min' ? Math.min(...values) : Math.max(...values) };
};

function limits(min: number, max: number): void {
  if (min > max) fail('Invalid', `the minimum ${String(min)} is above the maximum ${String(max)}`);
}

const clamp: PureBody = (ports) => {
  const value = ports.number('value');
  const min = ports.number('min');
  const max = ports.number('max');
  limits(min, max);
  const result = Math.min(Math.max(value, min), max);
  return { result, clamped: result !== value };
};

const checkRange: PureBody = (ports) => {
  const value = ports.number('value');
  const min = ports.number('min');
  const max = ports.number('max');
  if (value >= min && value <= max) return { result: value };
  return fail(
    'Invalid',
    ports.maybeText('message') ?? `${String(value)} is outside ${String(min)} to ${String(max)}`,
  );
};

function positionIn(offset: number, span: number, mode: string): number {
  if (mode === 'clamp') return Math.min(Math.max(offset / span, 0), 1);
  if (mode === 'wrap') return (offset - Math.floor(offset / span) * span) / span;
  return offset / span;
}

const mapRange: PureBody = (ports) => {
  const inMin = ports.number('inMin');
  const outMin = ports.number('outMin');
  const span = divisor(ports.number('inMax') - inMin, 'mapping over an empty input range');
  const position = positionIn(ports.number('value') - inMin, span, ports.text('limit'));
  return { result: finite(outMin + position * (ports.number('outMax') - outMin), 'the mapping') };
};

function median(sorted: readonly number[]): number {
  const middle = Math.floor(sorted.length / 2);
  const high = sorted[middle] ?? 0;
  return sorted.length % 2 === 1 ? high : ((sorted[middle - 1] ?? 0) + high) / 2;
}

function deviation(values: readonly number[], average: number): number {
  const squares = values.map((value) => (value - average) ** 2);
  return Math.sqrt(sum(squares) / values.length);
}

const stats: PureBody = (ports) => {
  const values = numbersOf(ports.list('values'), 'values');
  if (values.length === 0) return { sum: 0, count: 0 };
  const sorted = [...values].sort((left, right) => left - right);
  const average = sum(values) / values.length;
  return outputs({
    sum: sum(values),
    average,
    median: median(sorted),
    min: sorted[0],
    max: sorted.at(-1),
    stddev: deviation(values, average),
    count: values.length,
  });
};

type Unary = (value: number) => number;

function within(name: string, allowed: (value: number) => boolean, apply: Unary): Unary {
  return (value) =>
    allowed(value)
      ? apply(value)
      : fail('MathError', `${name} is not defined for ${String(value)}`);
}

const UNARY: Readonly<Record<string, Unary>> = {
  abs: Math.abs,
  sign: Math.sign,
  negate: (value) => -value,
  sqrt: within('square root', (value) => value >= 0, Math.sqrt),
  log10: within('log10', (value) => value > 0, Math.log10),
  ln: within('ln', (value) => value > 0, Math.log),
  exp: Math.exp,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: within('asin', (value) => Math.abs(value) <= 1, Math.asin),
  acos: within('acos', (value) => Math.abs(value) <= 1, Math.acos),
  atan: Math.atan,
  degrees: (value) => (value * 180) / Math.PI,
  radians: (value) => (value * Math.PI) / 180,
};

const BINARY: Readonly<Record<string, (value: number, other: number) => number>> = {
  power: (value, other) => value ** other,
  atan2: (value, other) => Math.atan2(value, other),
};

function applied(op: string, value: number, other: number | undefined): number {
  const unary = UNARY[op];
  if (unary !== undefined) return unary(value);
  const binary = BINARY[op];
  if (binary === undefined) return fail('Invalid', `${op} is not a math function`);
  if (other === undefined) return fail('Invalid', `${op} needs a second number in b`);
  return binary(value, other);
}

const mathFunction: PureBody = (ports) => {
  const op = ports.text('op');
  return { result: finite(applied(op, ports.number('value'), ports.maybeNumber('b')), op) };
};

export const MATH_BODIES: PureBodies = {
  'math.add': add,
  'math.subtract': subtractBody,
  'math.multiply': multiply,
  'math.divide': divide,
  'math.modulo': modulo,
  'math.round': round,
  'math.min_max': minMax,
  'math.clamp': clamp,
  'math.check_range': checkRange,
  'math.map_range': mapRange,
  'math.stats': stats,
  'math.function': mathFunction,
};
