import type { FlowType } from '../automation-v3/types';
import type { InputPortDecl, NodeKind, OutputPortDecl } from './define';
import { defineNodeKind } from './define';

const NUMBER: FlowType = { t: 'number' };
const FLAG: FlowType = { t: 'boolean' };
const ARITH: FlowType = { t: 'param', name: 'num' };

function choice(options: readonly (readonly [string, string])[]): FlowType {
  return {
    t: 'choice',
    options: options.map(([id, label]) => ({ id, label })),
  };
}

function option(
  name: string,
  type: FlowType,
  description: string,
  extra: Partial<InputPortDecl> = {},
): InputPortDecl {
  return { name, type, required: false, static: true, description, ...extra };
}

function input(name: string, type: FlowType, description: string): InputPortDecl {
  return { name, type, required: true, description };
}

function terms(first: string, second: string): readonly InputPortDecl[] {
  return [
    input('a', ARITH, first),
    input('b', ARITH, second),
    { name: 'c', type: ARITH, required: false, description: 'A third value, when needed.' },
    { name: 'd', type: ARITH, required: false, description: 'A fourth value, when needed.' },
  ];
}

function output(name: string, type: FlowType, description: string): OutputPortDecl {
  return { name, type, description };
}

function pure(
  fields: Pick<NodeKind, 'id' | 'name' | 'icon' | 'description' | 'summary' | 'keywords'> &
    Pick<NodeKind, 'inputs' | 'outputs'>,
): NodeKind {
  return defineNodeKind({
    ...fields,
    category: 'math',
    class: 'pure',
    exits: [],
    access: 'member',
    tier: 'v1',
  });
}

const add = pure({
  id: 'math.add',
  name: 'Add',
  icon: 'plus',
  description:
    'Adds the wired values a, b, c and d: numbers, durations, or durations added to one instant. To add up a whole list use List statistics.',
  inputs: terms('The first value.', 'The value to add to it.'),
  outputs: [output('result', ARITH, 'The sum.')],
  summary: '{a} plus {b}',
  keywords: ['plus', 'sum', 'total', 'increase'],
});

const subtract = pure({
  id: 'math.subtract',
  name: 'Subtract',
  icon: 'minus',
  description: 'Subtracts b from a. Two instants give a duration.',
  inputs: [
    input('a', ARITH, 'The value to subtract from.'),
    input('b', ARITH, 'The value to take away.'),
  ],
  outputs: [output('result', ARITH, 'The difference.')],
  summary: '{a} minus {b}',
  keywords: ['minus', 'difference', 'decrease', 'take away'],
});

const multiply = pure({
  id: 'math.multiply',
  name: 'Multiply',
  icon: 'x',
  description:
    'Multiplies the wired values a, b, c and d. A duration may be multiplied by a number.',
  inputs: terms('The first value.', 'The value to multiply it by.'),
  outputs: [output('result', ARITH, 'The product.')],
  summary: '{a} times {b}',
  keywords: ['times', 'product', 'scale'],
});

const divide = pure({
  id: 'math.divide',
  name: 'Divide',
  icon: 'divide',
  description: 'Divides a by b. A zero b fails with MathError.',
  inputs: [
    input('a', NUMBER, 'The dividend.'),
    input('b', NUMBER, 'The divisor.'),
    option('integer', FLAG, 'Round the result down to a whole number.', { default: false }),
  ],
  outputs: [output('result', NUMBER, 'The quotient.')],
  summary: '{a} divided by {b}',
  keywords: ['quotient', 'ratio', 'per', 'floor'],
});

const modulo = pure({
  id: 'math.modulo',
  name: 'Remainder',
  icon: 'square-percent',
  description:
    'The remainder of a divided by b, never negative for a positive b. A zero b fails with MathError.',
  inputs: [input('a', NUMBER, 'The dividend.'), input('b', NUMBER, 'The divisor.')],
  outputs: [output('result', NUMBER, 'The remainder.')],
  summary: '{a} mod {b}',
  keywords: ['mod', 'modulus', 'remainder', 'cycle', 'wrap'],
});

const round = pure({
  id: 'math.round',
  name: 'Round',
  icon: 'circle-dot',
  description: 'Rounds a number, halves away from zero.',
  inputs: [
    input('value', NUMBER, 'The number to round.'),
    option(
      'mode',
      choice([
        ['round', 'round'],
        ['floor', 'down'],
        ['ceil', 'up'],
        ['trunc', 'toward zero'],
      ]),
      'How to round.',
      { default: 'round', summary: true },
    ),
    option('places', { t: 'number', integer: true, min: -6, max: 10 }, 'Decimal places.', {
      default: 0,
    }),
    option('toStep', { t: 'number', min: 0 }, 'Round to the nearest multiple of this, such as 5.'),
  ],
  outputs: [output('result', NUMBER, 'The rounded number.')],
  summary: 'Round {value}',
  keywords: ['floor', 'ceiling', 'truncate', 'decimals', 'nearest'],
});

const minMax = pure({
  id: 'math.min_max',
  name: 'Min or max',
  icon: 'arrow-down-up',
  description: 'The smallest or largest of a list of numbers. An empty list fails with Invalid.',
  inputs: [
    input('values', { t: 'list', of: NUMBER }, 'The numbers.'),
    option(
      'op',
      choice([
        ['min', 'smallest'],
        ['max', 'largest'],
      ]),
      'Smallest or largest.',
      { default: 'max', summary: true },
    ),
  ],
  outputs: [output('result', NUMBER, 'The chosen number.')],
  summary: 'The {op} of {values}',
  keywords: ['minimum', 'maximum', 'lowest', 'highest', 'coldest', 'hottest'],
});

const clamp = pure({
  id: 'math.clamp',
  name: 'Keep within',
  icon: 'brackets',
  description: 'Pulls a number into a range. A min above max fails with Invalid.',
  inputs: [
    input('value', NUMBER, 'The number.'),
    input('min', NUMBER, 'The lowest allowed.'),
    input('max', NUMBER, 'The highest allowed.'),
  ],
  outputs: [
    output('result', NUMBER, 'The number kept within the range.'),
    output('clamped', FLAG, 'Whether the number had to be moved.'),
  ],
  summary: 'Keep {value} between {min} and {max}',
  keywords: ['limit', 'bound', 'constrain', 'cap', 'brightness'],
});

const checkRange = pure({
  id: 'math.check_range',
  name: 'Must be within',
  icon: 'shield-alert',
  description: 'Passes a number through, or fails with Invalid when it lies outside the range.',
  inputs: [
    input('value', NUMBER, 'The number.'),
    input('min', NUMBER, 'The lowest allowed.'),
    input('max', NUMBER, 'The highest allowed.'),
    option('message', { t: 'text' }, 'The error message when outside.'),
  ],
  outputs: [output('result', NUMBER, 'The same number.')],
  summary: '{value} must be between {min} and {max}',
  keywords: ['validate', 'reject', 'guard', 'assert', 'range'],
});

const mapRange = pure({
  id: 'math.map_range',
  name: 'Map range',
  icon: 'move-horizontal',
  description: 'Converts a number from one range to another.',
  inputs: [
    input('value', NUMBER, 'The number.'),
    input('inMin', NUMBER, 'Start of the input range.'),
    input('inMax', NUMBER, 'End of the input range.'),
    input('outMin', NUMBER, 'Start of the output range.'),
    input('outMax', NUMBER, 'End of the output range.'),
    option(
      'limit',
      choice([
        ['clamp', 'keep within'],
        ['wrap', 'wrap around'],
        ['none', 'extend'],
      ]),
      'What happens outside the input range.',
      { default: 'clamp' },
    ),
  ],
  outputs: [output('result', NUMBER, 'The mapped number.')],
  summary: 'Map {value} from {inMin}..{inMax} to {outMin}..{outMax}',
  keywords: ['scale', 'rescale', 'interpolate', 'lux', 'range'],
});

const stats = pure({
  id: 'math.stats',
  name: 'List statistics',
  icon: 'sigma',
  description: 'Sum, average, median, smallest, largest, spread and count of a list of numbers.',
  inputs: [input('values', { t: 'list', of: NUMBER }, 'The numbers.')],
  outputs: [
    output('sum', NUMBER, 'The total.'),
    {
      name: 'average',
      type: NUMBER,
      optional: true,
      description: 'The mean. Absent for an empty list.',
    },
    {
      name: 'median',
      type: NUMBER,
      optional: true,
      description: 'The middle value. Absent for an empty list.',
    },
    {
      name: 'min',
      type: NUMBER,
      optional: true,
      description: 'The smallest. Absent for an empty list.',
    },
    {
      name: 'max',
      type: NUMBER,
      optional: true,
      description: 'The largest. Absent for an empty list.',
    },
    {
      name: 'stddev',
      type: NUMBER,
      optional: true,
      description: 'The spread. Absent for an empty list.',
    },
    output('count', { t: 'number', integer: true }, 'How many numbers.'),
  ],
  summary: 'Statistics of {values}',
  keywords: ['average', 'mean', 'median', 'sum', 'total', 'deviation', 'count'],
});

const func = pure({
  id: 'math.function',
  name: 'Math function',
  icon: 'square-function',
  description:
    'A single math function such as square root or sine. A domain error fails with MathError.',
  inputs: [
    input('value', NUMBER, 'The number.'),
    {
      name: 'b',
      type: NUMBER,
      required: false,
      description: 'The second number, for power and atan2.',
    },
    option(
      'op',
      choice([
        ['abs', 'absolute value'],
        ['sign', 'sign'],
        ['negate', 'negate'],
        ['sqrt', 'square root'],
        ['power', 'power'],
        ['log10', 'log base 10'],
        ['ln', 'natural log'],
        ['exp', 'exponential'],
        ['sin', 'sine'],
        ['cos', 'cosine'],
        ['tan', 'tangent'],
        ['asin', 'arcsine'],
        ['acos', 'arccosine'],
        ['atan', 'arctangent'],
        ['atan2', 'arctangent of value over b'],
        ['degrees', 'to degrees'],
        ['radians', 'to radians'],
      ]),
      'Which function.',
      { default: 'abs', summary: true },
    ),
  ],
  outputs: [output('result', NUMBER, 'The result.')],
  summary: '{op} of {value}',
  keywords: ['abs', 'sqrt', 'power', 'log', 'sin', 'cos', 'tan', 'trigonometry', 'exponent'],
});

export const MATH_KINDS: readonly NodeKind[] = [
  add,
  subtract,
  multiply,
  divide,
  modulo,
  round,
  minMax,
  clamp,
  checkRange,
  mapRange,
  stats,
  func,
];
