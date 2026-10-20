import type { FlowType } from '../automation-v3/types';
import { AI_SHAPE_FIELD_TYPES } from './ai-shape';
import type { InputPortDecl, NodeKind, OutputPortDecl } from './define';
import { defineNodeKind } from './define';

const TEXT: FlowType = { t: 'text' };

const PERSON: FlowType = { t: 'optional', of: { t: 'ref', of: 'person' } };

const SHAPE: FlowType = {
  t: 'optional',
  of: {
    t: 'record',
    values: {
      t: 'choice',
      options: AI_SHAPE_FIELD_TYPES.map((id) => ({ id, label: id.replaceAll('_', ' ') })),
    },
  },
};

function option(
  name: string,
  type: FlowType,
  description: string,
  extra: Partial<InputPortDecl> = {},
): InputPortDecl {
  return { name, type, required: false, static: true, description, ...extra };
}

const COMMON: readonly InputPortDecl[] = [
  option('person', PERSON, 'The person the call runs as and is charged to.'),
  option(
    'model',
    { t: 'optional', of: TEXT },
    'A model id. The default model of the AI settings when left out.',
  ),
  option(
    'budget',
    { t: 'optional', of: { t: 'number', min: 0, unit: 'USD' } },
    'The most this one call may cost.',
  ),
];

const TOOLS = option(
  'tools',
  { t: 'list', of: TEXT },
  'The assistant tools this call may use. None by default.',
  {
    default: [],
    ui: { optionsFrom: 'tools' },
  },
);

const USAGE: readonly OutputPortDecl[] = [
  { name: 'tokens', type: { t: 'number', integer: true }, description: 'Tokens used.' },
  { name: 'cost', type: { t: 'number', min: 0, unit: 'USD' }, description: 'What the call cost.' },
];

const RESULT: OutputPortDecl = {
  name: 'result',
  type: { t: 'optional', of: { t: 'record', values: { t: 'any' } } },
  optional: true,
  description: 'The answer as fields, when a shape was given.',
};

const EFFECT = { retry: 'external', budget: 'effects_person' } as const;

const AI_ASK = defineNodeKind({
  id: 'ai.ask',
  name: 'Ask the AI',
  category: 'ai',
  icon: 'sparkles',
  class: 'effect',
  description:
    'Asks the AI one question and gives back its answer, as text or as fields of a shape you set. Pictures can go with the question. It has no tools unless you allow some.',
  inputs: [
    {
      name: 'prompt',
      type: TEXT,
      required: true,
      live: true,
      summary: true,
      description: 'The question or instruction.',
    },
    {
      name: 'images',
      type: { t: 'optional', of: { t: 'list', of: TEXT } },
      required: false,
      live: true,
      description: 'Pictures to show the AI, as picture ids from Camera picture.',
    },
    option('system', { t: 'optional', of: TEXT }, 'How the AI should behave.'),
    option('shape', SHAPE, 'Answer with these fields instead of free text.'),
    TOOLS,
    ...COMMON,
  ],
  outputs: [{ name: 'text', type: TEXT, description: 'The answer as text.' }, RESULT, ...USAGE],
  exits: ['next'],
  effect: EFFECT,
  summary: 'Ask the AI {prompt}',
  keywords: ['ai', 'ask', 'gemini', 'llm', 'write', 'generate', 'question'],
  access: 'owner',
  tier: 'v1.1',
});

const AI_VISION = defineNodeKind({
  id: 'ai.vision',
  name: 'Look at picture',
  category: 'ai',
  icon: 'scan-eye',
  class: 'effect',
  description: 'Shows the AI a picture or a camera and asks a question about it.',
  inputs: [
    {
      name: 'question',
      type: TEXT,
      required: true,
      live: true,
      summary: true,
      description: 'What to find out.',
    },
    {
      name: 'image',
      type: { t: 'optional', of: TEXT },
      required: false,
      live: true,
      description: 'A picture id from Camera picture.',
    },
    option(
      'camera',
      { t: 'optional', of: { t: 'ref', of: 'camera' } },
      'Take a new picture from this camera.',
      {
        summary: true,
      },
    ),
    option('shape', SHAPE, 'Answer with these fields instead of free text.'),
    ...COMMON,
  ],
  outputs: [{ name: 'answer', type: TEXT, description: 'The answer as text.' }, RESULT, ...USAGE],
  exits: ['next'],
  effect: EFFECT,
  summary: 'Look and answer {question}',
  keywords: ['ai', 'vision', 'picture', 'camera', 'look', 'see', 'package', 'person'],
  access: 'owner',
  tier: 'v1.1',
});

const AI_DECIDE = defineNodeKind({
  id: 'ai.decide',
  name: 'AI yes or no',
  category: 'ai',
  icon: 'circle-help',
  class: 'effect',
  description: 'Asks the AI a yes or no question and gives back the answer with its reason.',
  inputs: [
    {
      name: 'question',
      type: TEXT,
      required: true,
      live: true,
      summary: true,
      description: 'The yes or no question.',
    },
    {
      name: 'context',
      type: { t: 'optional', of: TEXT },
      required: false,
      live: true,
      description: 'What the AI needs to know to answer.',
    },
    ...COMMON,
  ],
  outputs: [
    { name: 'answer', type: { t: 'boolean' }, description: 'Yes is true.' },
    { name: 'reason', type: TEXT, description: 'Why the AI answered that way.' },
    ...USAGE,
  ],
  exits: ['next'],
  effect: EFFECT,
  summary: 'Ask the AI yes or no {question}',
  keywords: ['ai', 'decide', 'yes', 'no', 'judge', 'worth'],
  access: 'owner',
  tier: 'v1.1',
});

export const AI_MODEL_KINDS: readonly NodeKind[] = [AI_ASK, AI_VISION, AI_DECIDE];
