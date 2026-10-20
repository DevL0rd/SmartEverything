import type { FlowType } from '../automation-v3/types';
import type { NodeKind } from './define';
import { defineNodeKind } from './define';

const SEED_KEY = 'random:seed';
const ITEM: FlowType = { t: 'param', name: 'T' };

export const RANDOM_KINDS: readonly NodeKind[] = [
  defineNodeKind({
    id: 'random.number',
    name: 'Random number',
    category: 'random',
    icon: 'dice-5',
    class: 'read',
    description:
      'Picks a random number between a minimum and a maximum, both included. The result is captured for the run, and tests can seed it.',
    inputs: [
      { name: 'min', type: { t: 'number' }, required: true, description: 'The lowest result.' },
      { name: 'max', type: { t: 'number' }, required: true, description: 'The highest result.' },
      {
        name: 'integer',
        type: { t: 'boolean' },
        required: false,
        default: true,
        static: true,
        description: 'Whole numbers only; turn off for decimals.',
      },
    ],
    outputs: [{ name: 'value', type: { t: 'number' }, description: 'The random number.' }],
    exits: [],
    summary: 'Random number from {min} to {max}',
    keywords: ['random', 'dice', 'number', 'chance'],
    reads: () => [SEED_KEY],
    access: 'member',
    tier: 'v1',
  }),
  defineNodeKind({
    id: 'random.choice',
    name: 'Random pick',
    category: 'random',
    icon: 'shuffle',
    class: 'read',
    description:
      'Picks one item from a list. Optional weights favour some items, and no-repeat mode uses every item once before any comes up again. The result is captured for the run, and tests can seed it.',
    inputs: [
      { name: 'list', type: { t: 'list', of: ITEM }, required: true, description: 'The items.' },
      {
        name: 'weights',
        type: { t: 'optional', of: { t: 'list', of: { t: 'number', min: 0 } } },
        required: false,
        static: true,
        description: 'One weight per item; a bigger weight comes up more often.',
      },
      {
        name: 'noRepeat',
        type: { t: 'boolean' },
        required: false,
        default: false,
        static: true,
        description: 'Use every item once before repeating any.',
      },
    ],
    outputs: [
      { name: 'item', type: ITEM, description: 'The picked item.' },
      { name: 'index', type: { t: 'number', integer: true }, description: 'Its position.' },
    ],
    exits: [],
    summary: 'Random pick from {list}',
    keywords: ['random', 'pick', 'choose', 'choice', 'shuffle'],
    reads: (ports) => (ports['noRepeat'] === undefined ? [SEED_KEY] : [SEED_KEY, 'random:history']),
    access: 'member',
    tier: 'v1',
  }),
];
