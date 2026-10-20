import type { NodeKind } from './define';
import { defineNodeKind } from './define';

const SEED_KEY = 'random:seed';

export const RANDOM_MORE_KINDS: readonly NodeKind[] = [
  defineNodeKind({
    id: 'random.chance',
    name: 'Coin flip',
    category: 'random',
    icon: 'coins',
    class: 'read',
    description:
      'True with the given probability, from 0 (never) to 1 (always). The result is captured for the run, and tests can seed it.',
    inputs: [
      {
        name: 'probability',
        type: { t: 'number', min: 0, max: 1 },
        required: true,
        description: 'The chance of true, from 0 to 1.',
      },
    ],
    outputs: [
      { name: 'result', type: { t: 'boolean' }, description: 'Whether the chance came up.' },
    ],
    exits: [],
    summary: '{probability} chance',
    keywords: ['random', 'chance', 'coin', 'flip', 'probability', 'percent'],
    reads: () => [SEED_KEY],
    access: 'member',
    tier: 'v1.1',
  }),
  defineNodeKind({
    id: 'random.duration',
    name: 'Random delay',
    category: 'random',
    icon: 'timer-reset',
    class: 'read',
    description:
      'A random duration between a minimum and a maximum, both included, to the millisecond. The result is captured for the run, and tests can seed it.',
    inputs: [
      { name: 'min', type: { t: 'duration' }, required: true, description: 'The shortest result.' },
      { name: 'max', type: { t: 'duration' }, required: true, description: 'The longest result.' },
    ],
    outputs: [{ name: 'duration', type: { t: 'duration' }, description: 'The random duration.' }],
    exits: [],
    summary: 'Random delay from {min} to {max}',
    keywords: ['random', 'delay', 'jitter', 'duration', 'wait', 'away'],
    reads: () => [SEED_KEY],
    access: 'member',
    tier: 'v1.1',
  }),
];
