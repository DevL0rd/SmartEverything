import { defineNodeKind, type NodeKind } from './define';

export const AI_WAKE = defineNodeKind({
  id: 'ai.wake',
  name: 'Hand to the assistant',
  category: 'ai',
  icon: 'bot',
  class: 'effect',
  description: 'Gives the assistant an instruction to carry out.',
  inputs: [
    {
      name: 'instruction',
      type: { t: 'text' },
      required: true,
      live: true,
      description: 'What the assistant should do.',
      summary: true,
    },
    {
      name: 'person',
      type: { t: 'optional', of: { t: 'ref', of: 'person' } },
      required: false,
      static: true,
      description: 'The person the assistant acts as.',
    },
    {
      name: 'chat',
      type: { t: 'optional', of: { t: 'ref', of: 'chat' } },
      required: false,
      static: true,
      description: 'The chat the work appears in.',
    },
  ],
  outputs: [],
  exits: ['next'],
  effect: { retry: 'external', budget: 'effects' },
  summary: 'Ask the assistant: {instruction}',
  keywords: ['ai', 'assistant', 'claude', 'agent', 'wake'],
  access: 'owner',
  tier: 'v1',
});

export const TOOL_CALL = defineNodeKind({
  id: 'tool.call',
  name: 'Use a tool',
  category: 'ai',
  icon: 'wrench',
  class: 'effect',
  description: 'Calls one of the assistant tools and gives back its result.',
  inputs: [
    {
      name: 'tool',
      type: { t: 'text' },
      required: true,
      static: true,
      description: 'The name of the tool.',
      summary: true,
      ui: { optionsFrom: 'tools' },
    },
    {
      name: 'args',
      type: { t: 'record', values: { t: 'any' } },
      required: false,
      default: {},
      description: 'The arguments of the tool.',
    },
    {
      name: 'person',
      type: { t: 'optional', of: { t: 'ref', of: 'person' } },
      required: false,
      static: true,
      description: 'The person the tool runs as.',
    },
  ],
  outputs: [
    { name: 'result', type: { t: 'any' }, description: 'What the tool returned.' },
    { name: 'ok', type: { t: 'boolean' }, description: 'Whether the tool succeeded.' },
  ],
  exits: ['next'],
  effect: { retry: 'external', budget: 'effects' },
  summary: 'Use the tool {tool}',
  keywords: ['tool', 'mcp', 'function call', 'speak'],
  access: 'owner',
  tier: 'v1',
});

export const AI_TOOLS_KINDS: readonly NodeKind[] = [AI_WAKE, TOOL_CALL];
