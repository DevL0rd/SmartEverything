import { defineNodeKind, type NodeKind } from './define';

export const FN_CALL = defineNodeKind({
  id: 'fn.call',
  name: 'Use Custom Node',
  category: 'reusable',
  icon: 'package',
  class: 'control',
  description: 'Runs a Custom Node inside this run.',
  inputs: [
    {
      name: 'fn',
      type: { t: 'ref', of: 'function' },
      required: true,
      static: true,
      description: 'Which Custom Node to use.',
      summary: true,
    },
    {
      name: 'pin',
      type: { t: 'optional', of: { t: 'number', integer: true, min: 1 } },
      required: false,
      static: true,
      description: 'A revision to stay on. Without it the latest revision is used.',
    },
  ],
  outputs: [],
  exits: ['next'],
  summary: 'Use {fn}',
  keywords: ['function', 'action', 'reusable', 'subroutine', 'call'],
  access: 'member',
  tier: 'v1',
});

export const AUTOMATION_RUN = defineNodeKind({
  id: 'automation.run',
  name: 'Run automation',
  category: 'automations',
  icon: 'play-circle',
  class: 'control',
  description: 'Starts another automation as its own run, and can wait for it to finish.',
  inputs: [
    {
      name: 'automation',
      type: { t: 'ref', of: 'automation' },
      required: true,
      static: true,
      description: 'Which automation to run.',
      summary: true,
    },
    {
      name: 'wait',
      type: { t: 'boolean' },
      required: false,
      default: false,
      static: true,
      description: 'Wait for the other run to finish and take its outputs.',
    },
    {
      name: 'allowSelf',
      type: { t: 'boolean' },
      required: false,
      default: false,
      static: true,
      description: 'Allow this automation to start itself.',
    },
  ],
  outputs: [{ name: 'runId', type: { t: 'text' }, description: 'The id of the started run.' }],
  exits: ['next'],
  stateful: true,
  summary: 'Run {automation}',
  keywords: ['call', 'start', 'trigger', 'nested'],
  access: 'member',
  tier: 'v1',
});

export const AUTOMATION_STOP = defineNodeKind({
  id: 'automation.stop',
  name: 'Stop automation',
  category: 'automations',
  icon: 'square',
  class: 'effect',
  description: 'Stops the running runs of another automation.',
  inputs: [
    {
      name: 'automation',
      type: { t: 'ref', of: 'automation' },
      required: true,
      static: true,
      description: 'Which automation to stop.',
      summary: true,
    },
    {
      name: 'key',
      type: { t: 'optional', of: { t: 'text' } },
      required: false,
      static: true,
      description: 'Only stop runs with this control key.',
    },
  ],
  outputs: [],
  exits: ['next'],
  effect: { retry: 'idempotent', budget: 'none' },
  summary: 'Stop {automation}',
  keywords: ['cancel', 'abort', 'end', 'kill'],
  access: 'member',
  tier: 'v1',
});

export const AUTOMATION_KINDS: readonly NodeKind[] = [FN_CALL, AUTOMATION_RUN, AUTOMATION_STOP];
