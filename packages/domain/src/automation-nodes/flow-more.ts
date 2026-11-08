import { defineNodeKind, type NodeKind } from './define';
import { GAP, LIMIT } from './flow';

export const FLOW_MORE_KINDS: readonly NodeKind[] = [
  defineNodeKind({
    id: 'flow.forever',
    name: 'Loop until break',
    category: 'flow',
    icon: 'infinity',
    class: 'control',
    description:
      'Runs the body again and again until a Break, Return or Stop ends it, or its optional limit is reached. Needs a way out: a Break, Return or Stop inside, or a limit.',
    inputs: [GAP, LIMIT],
    outputs: [],
    exits: [],
    scopes: { required: ['body'], optional: [] },
    summary: 'Loop until break',
    keywords: ['loop', 'forever', 'endless', 'repeat', 'infinite', 'break'],
    access: 'member',
    tier: 'v1.1',
  }),
];
