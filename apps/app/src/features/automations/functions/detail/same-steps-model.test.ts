import type { AutomationFunctionDetail, AutomationV3, FlowNode } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { sameStepsRows, sameStepsSummary } from './same-steps-model';

let counter = 0;

function step(key: string, kind: string, level: number): FlowNode {
  counter += 1;
  return {
    id: `00000000-0000-4000-8000-${counter.toString(16).padStart(12, '0')}`,
    key,
    kind,
    ports: { level: { lit: level } },
  };
}

function automation(...nodes: FlowNode[]): AutomationV3 {
  return {
    version: 3,
    kind: 'automation',
    triggers: [],
    inputs: [],
    outputs: [],
    variables: [],
    body: { nodes },
    policy: { mode: 'single' },
  };
}

function detail(usedBy: AutomationFunctionDetail['usedBy'] = []): AutomationFunctionDetail {
  return {
    id: 'fn',
    name: 'Dim lights',
    description: null,
    category: null,
    icon: null,
    builtin: false,
    editable: true,
    revision: 1,
    interface: { flavour: 'action', inputs: [], outputs: [], exits: ['done'] },
    interfaceHash: 'h',
    users: usedBy.length,
    createdBy: null,
    updatedAt: null,
    program: {
      version: 3,
      kind: 'function',
      flavour: 'action',
      inputs: [],
      outputs: [],
      exits: ['done'],
      variables: [],
      body: { nodes: [step('dim', 'light.dim', 20), step('wait', 'flow.wait', 5)] },
    },
    layout: { nodes: {}, frames: [], comments: [] },
    usedBy,
  };
}

const SAME = [step('a', 'light.dim', 20), step('b', 'flow.wait', 5)];

describe('same steps rows', () => {
  it('lists automations that repeat the steps, leaving out those already using the node', () => {
    const rows = sameStepsRows(detail([{ kind: 'automation', id: 'mine', name: 'Mine' }]), [
      { id: 'one', name: 'Evening', definition: automation(...SAME, ...SAME) },
      { id: 'mine', name: 'Mine', definition: automation(...SAME) },
      { id: 'other', name: 'Other', definition: automation(step('a', 'light.dim', 80)) },
    ]);
    expect(rows).toEqual([
      { id: 'one', name: 'Evening', places: 2, text: 'Same steps in 2 places' },
    ]);
  });

  it('says so when nothing repeats the steps', () => {
    expect(sameStepsRows(detail(), [])).toEqual([]);
    expect(sameStepsSummary([])).toBe('None of your other automations repeat these steps.');
    expect(sameStepsSummary([{ id: 'x', name: 'X', places: 1, text: '' }])).toBe(
      '1 automation repeats these steps. Open it to use this node there.',
    );
  });
});
