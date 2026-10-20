import type { PureBodies, PureBody } from './support';
import { fail, finite } from './support';

const SIGNIFICANT_DIGITS = 12;

function tidy(value: number): number {
  return Number(value.toPrecision(SIGNIFICANT_DIGITS));
}

function percentOperation(op: string, a: number, b: number): number {
  if (op === 'of') {
    return b === 0 ? fail('MathError', 'a percent of zero is undefined') : (a / b) * 100;
  }
  if (op === 'change') {
    return a === 0 ? fail('MathError', 'a change from zero has no percent') : ((b - a) / a) * 100;
  }
  if (op === 'part') return (a * b) / 100;
  return fail('Invalid', `${op} is not a percent operation`);
}

const percent: PureBody = (ports) => ({
  value: tidy(
    finite(percentOperation(ports.text('op'), ports.number('a'), ports.number('b')), 'the percent'),
  ),
});

interface UnitScale {
  readonly dimension: string;
  readonly toBase: (value: number) => number;
  readonly fromBase: (value: number) => number;
}

function linear(dimension: string, factor: number): UnitScale {
  return { dimension, toBase: (value) => value * factor, fromBase: (value) => value / factor };
}

function reciprocal(dimension: string): UnitScale {
  const flip = (value: number): number =>
    value === 0 ? fail('MathError', 'zero has no reciprocal') : 1_000_000 / value;
  return { dimension, toBase: flip, fromBase: flip };
}

const ABSOLUTE_ZERO = 273.15;

export const UNIT_SCALES: Readonly<Record<string, UnitScale>> = {
  c: {
    dimension: 'temperature',
    toBase: (value) => value + ABSOLUTE_ZERO,
    fromBase: (value) => value - ABSOLUTE_ZERO,
  },
  f: {
    dimension: 'temperature',
    toBase: (value) => ((value - 32) * 5) / 9 + ABSOLUTE_ZERO,
    fromBase: (value) => ((value - ABSOLUTE_ZERO) * 9) / 5 + 32,
  },
  k: linear('temperature', 1),
  m: linear('length', 1),
  km: linear('length', 1000),
  mi: linear('length', 1609.344),
  ft: linear('length', 0.3048),
  w: linear('power', 1),
  kw: linear('power', 1000),
  wh: linear('energy', 1),
  kwh: linear('energy', 1000),
  hpa: linear('pressure', 1),
  in_hg: linear('pressure', 33.8638866667),
  kmh: linear('speed', 1 / 3.6),
  mph: linear('speed', 0.44704),
  ms: linear('speed', 1),
  mired: reciprocal('colour temperature'),
  kelvin: linear('colour temperature', 1),
  l: linear('volume', 1),
  gal: linear('volume', 3.785411784),
};

function scaleOf(id: string): UnitScale {
  return UNIT_SCALES[id] ?? fail('Invalid', `${id} is not a unit`);
}

const convertUnit: PureBody = (ports) => {
  const from = scaleOf(ports.text('from'));
  const to = scaleOf(ports.text('to'));
  if (from.dimension !== to.dimension) {
    return fail('Invalid', `${from.dimension} cannot be converted to ${to.dimension}`);
  }
  const base = from.toBase(ports.number('value'));
  return { value: tidy(finite(to.fromBase(base), 'the conversion')) };
};

export const MATH_MORE_BODIES: PureBodies = {
  'math.percent': percent,
  'math.convert_unit': convertUnit,
};
