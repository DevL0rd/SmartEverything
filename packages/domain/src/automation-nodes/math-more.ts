import type { NodeKind } from './define';
import { defineNodeKind } from './define';
import { NUMBER, choice, input, option, output } from './more-support';

export const CONVERT_UNITS = [
  { id: 'c', label: '°C', dimension: 'temperature' },
  { id: 'f', label: '°F', dimension: 'temperature' },
  { id: 'k', label: 'K', dimension: 'temperature' },
  { id: 'm', label: 'm', dimension: 'length' },
  { id: 'km', label: 'km', dimension: 'length' },
  { id: 'mi', label: 'mi', dimension: 'length' },
  { id: 'ft', label: 'ft', dimension: 'length' },
  { id: 'w', label: 'W', dimension: 'power' },
  { id: 'kw', label: 'kW', dimension: 'power' },
  { id: 'wh', label: 'Wh', dimension: 'energy' },
  { id: 'kwh', label: 'kWh', dimension: 'energy' },
  { id: 'hpa', label: 'hPa', dimension: 'pressure' },
  { id: 'in_hg', label: 'inHg', dimension: 'pressure' },
  { id: 'kmh', label: 'km/h', dimension: 'speed' },
  { id: 'mph', label: 'mph', dimension: 'speed' },
  { id: 'ms', label: 'm/s', dimension: 'speed' },
  { id: 'mired', label: 'mired', dimension: 'colour temperature' },
  { id: 'kelvin', label: 'kelvin', dimension: 'colour temperature' },
  { id: 'l', label: 'l', dimension: 'volume' },
  { id: 'gal', label: 'gal (US)', dimension: 'volume' },
] as const;

export type ConvertUnitId = (typeof CONVERT_UNITS)[number]['id'];

const UNIT_CHOICES = choice(CONVERT_UNITS.map((unit) => [unit.id, unit.label] as const));

const PERCENT_OPERATIONS = [
  ['of', 'a as a percent of b'],
  ['change', 'percent change from a to b'],
  ['part', 'b percent of a'],
] as const;

export const MATH_MORE_KINDS: readonly NodeKind[] = [
  defineNodeKind({
    id: 'math.percent',
    name: 'Percent',
    category: 'math',
    icon: 'percent',
    class: 'pure',
    description:
      'Works with percentages: a as a percent of b, the percent change from a to b, or b percent of a. A zero base fails with MathError.',
    inputs: [
      input('a', NUMBER, 'The first number.'),
      input('b', NUMBER, 'The second number.'),
      option('op', choice(PERCENT_OPERATIONS), 'What to work out.', {
        default: 'of',
        summary: true,
      }),
    ],
    outputs: [output('value', NUMBER, 'The result.')],
    exits: [],
    summary: '{op} of {a} and {b}',
    keywords: ['percent', 'percentage', 'change', 'ratio', 'drop', 'battery'],
    access: 'member',
    tier: 'v1.1',
  }),
  defineNodeKind({
    id: 'math.convert_unit',
    name: 'Convert unit',
    category: 'math',
    icon: 'ruler',
    class: 'pure',
    description:
      'Converts a number between units of the same kind: temperature, length, power, energy, pressure, speed, colour temperature or volume. Units of different kinds fail with Invalid.',
    inputs: [
      input('value', NUMBER, 'The number to convert.'),
      option('from', UNIT_CHOICES, 'The unit it is in.', { required: true, summary: true }),
      option('to', UNIT_CHOICES, 'The unit to convert to.', { required: true, summary: true }),
    ],
    outputs: [output('value', NUMBER, 'The converted number.')],
    exits: [],
    summary: '{value} from {from} to {to}',
    keywords: ['convert', 'unit', 'celsius', 'fahrenheit', 'kelvin', 'mph', 'kwh', 'mired'],
    access: 'member',
    tier: 'v1.1',
  }),
];
