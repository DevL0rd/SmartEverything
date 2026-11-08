import { HEALTH_METRICS } from '../api/rows-access';
import type { FlowType } from '../automation-v3/types';
import { defineNodeKind, type NodeKind } from './define';
import { ERROR_OUT } from './error-port';

const PERSON: FlowType = { t: 'ref', of: 'person' };
const NUMBER: FlowType = { t: 'number' };
const COUNT: FlowType = { t: 'number', integer: true, min: 0 };
const DATE: FlowType = { t: 'date' };

export const HEALTH_WATER_UNIT_CHOICES = [
  { id: 'millilitres', label: 'Millilitres' },
  { id: 'glasses', label: 'Glasses' },
] as const;

export const HEALTH_RANGE_DEFAULT_DAYS = 7;

const PERSON_INPUT = {
  name: 'person',
  type: PERSON,
  required: true,
  description: 'Whose health.',
  summary: true,
  ui: { label: 'Person', optionsFrom: 'people' },
} as const;

const healthToday = defineNodeKind({
  id: 'health.today',
  name: 'Health today',
  category: 'people',
  icon: 'heartPulse',
  class: 'read',
  description:
    'Reads one person’s day so far: steps, active energy, sleep, water and how many of their daily goals are met. A figure nobody has recorded yet today is left empty and its goal counts as not met. Today is the day at home.',
  inputs: [PERSON_INPUT],
  outputs: [
    { name: 'day', type: DATE, description: 'The day these figures belong to.' },
    {
      name: 'steps',
      type: NUMBER,
      optional: true,
      description: 'Steps so far today.',
    },
    {
      name: 'energy',
      type: { t: 'number', unit: 'kcal' },
      optional: true,
      description: 'Active energy burned so far today, in kilocalories.',
    },
    {
      name: 'sleep',
      type: { t: 'duration' },
      optional: true,
      description: 'Time asleep in the night that ended today.',
    },
    {
      name: 'water',
      type: { t: 'number', unit: 'ml' },
      optional: true,
      description: 'Water drunk so far today, in millilitres.',
    },
    {
      name: 'goalsMet',
      type: COUNT,
      description:
        'How many of the person’s daily goals are met: steps, move, active minutes, sleep and water.',
    },
    { name: 'goalsTotal', type: COUNT, description: 'How many daily goals there are.' },
  ],
  exits: [],
  summary: 'Today for {person}',
  keywords: [
    'health',
    'today',
    'steps',
    'energy',
    'calories',
    'sleep',
    'water',
    'hydration',
    'goals',
    'fitness',
    'daily',
  ],
  access: 'member',
  tier: 'v1.1',
});

const healthRange = defineNodeKind({
  id: 'health.range',
  name: 'Health over days',
  category: 'people',
  icon: 'activity',
  class: 'read',
  description:
    'Reads one health figure of a person for today and the days before it: the figure of each day that has one, oldest first, and their average. Days without a figure are left out of the list and the average.',
  inputs: [
    PERSON_INPUT,
    {
      name: 'metric',
      type: {
        t: 'choice',
        options: HEALTH_METRICS.map((id) => ({ id, label: id.replaceAll('_', ' ') })),
      },
      required: true,
      static: true,
      description: 'Which figure.',
      summary: true,
      ui: { label: 'Figure', optionsFrom: 'health.metrics' },
    },
    {
      name: 'days',
      type: { t: 'number', integer: true, min: 1 },
      required: false,
      default: HEALTH_RANGE_DEFAULT_DAYS,
      description: 'How many days to look at, counting today.',
      summary: true,
      ui: { label: 'Days', min: 1, step: 1, unit: 'days' },
    },
  ],
  outputs: [
    {
      name: 'values',
      type: { t: 'list', of: NUMBER },
      description: 'The figure of each day that has one, oldest first.',
    },
    {
      name: 'dates',
      type: { t: 'list', of: DATE },
      description: 'The day of each figure, in the same order.',
    },
    { name: 'count', type: COUNT, description: 'How many days have a figure.' },
    {
      name: 'average',
      type: NUMBER,
      optional: true,
      description: 'The average of those figures; empty when no day has one.',
    },
    { name: 'unit', type: { t: 'text' }, description: 'The unit of the figure.' },
  ],
  exits: [],
  summary: '{metric} of {person} over {days} days',
  keywords: [
    'health',
    'range',
    'history',
    'average',
    'week',
    'trend',
    'steps',
    'sleep',
    'weight',
    'heart',
    'days',
  ],
  access: 'member',
  tier: 'v1.1',
});

const healthLogWater = defineNodeKind({
  id: 'health.log_water',
  name: 'Log water',
  category: 'people',
  icon: 'glassWater',
  class: 'effect',
  description:
    'Logs a drink of water for a person, in millilitres or in glasses of their glass size, and gives the total they have drunk today. Leave the person empty to log for the owner of the automation.',
  inputs: [
    {
      name: 'person',
      type: PERSON,
      required: false,
      description: 'Whose drink. Leave empty for the owner of the automation.',
      summary: true,
      ui: { label: 'Person', optionsFrom: 'people' },
    },
    {
      name: 'amount',
      type: NUMBER,
      required: true,
      description: 'How much was drunk, in the unit below.',
      summary: true,
      ui: { label: 'Amount', step: 1 },
    },
    {
      name: 'unit',
      type: { t: 'choice', options: [...HEALTH_WATER_UNIT_CHOICES] },
      required: false,
      default: 'millilitres',
      static: true,
      description: 'Whether the amount is millilitres or glasses.',
      ui: { label: 'Unit' },
    },
  ],
  outputs: [
    {
      name: 'added',
      type: { t: 'number', unit: 'ml' },
      description: 'The millilitres this drink added.',
    },
    {
      name: 'total',
      type: { t: 'number', unit: 'ml' },
      description: 'All the water the person has drunk today, in millilitres.',
    },
    ERROR_OUT,
  ],
  exits: ['next'],
  effect: { retry: 'relative', budget: 'effects' },
  summary: 'Log {amount} {unit} of water for {person}',
  keywords: ['water', 'drink', 'hydration', 'glass', 'log', 'health', 'millilitres'],
  access: 'member',
  tier: 'v1.1',
});

export const HEALTH_KINDS: readonly NodeKind[] = [healthToday, healthRange, healthLogWater];
