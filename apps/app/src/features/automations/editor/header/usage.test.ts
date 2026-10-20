import { describe, expect, it } from 'vitest';
import type { AutomationV3 } from '@smarteverything/domain';
import { inputInUse, outputInUse, variableInUse } from './usage';

function program(): AutomationV3 {
  return {
    version: 3,
    kind: 'automation',
    triggers: [],
    variables: [{ name: 'count', type: { t: 'number' }, initial: { lit: 0 } }],
    inputs: [{ name: 'who', type: { t: 'text' }, required: false }],
    outputs: [{ name: 'done', type: { t: 'boolean' } }],
    body: {
      nodes: [
        {
          id: '00000000-0000-4000-8000-0000000000b1',
          key: 'a',
          kind: 'var.set',
          ports: { name: { lit: 'count' }, to: { wire: { from: 'inputs', port: 'who' } } },
        },
        {
          id: '00000000-0000-4000-8000-0000000000b2',
          key: 'b',
          kind: 'flow.return',
          ports: { done: { lit: true } },
        },
      ],
    },
    policy: { mode: 'single' },
  };
}

describe('rename usage', () => {
  it('finds names still used', () => {
    expect(variableInUse(program(), 'count')).toBe(true);
    expect(inputInUse(program(), 'who')).toBe(true);
    expect(outputInUse(program(), 'done')).toBe(true);
  });
  it('allows unused names', () => {
    expect(variableInUse(program(), 'other')).toBe(false);
    expect(inputInUse(program(), 'nope')).toBe(false);
    expect(outputInUse(program(), 'nope')).toBe(false);
  });
});
