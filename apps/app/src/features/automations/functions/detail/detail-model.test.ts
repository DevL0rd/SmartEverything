import { describe, expect, it } from 'vitest';
import { FUNCTION_V3, type AutomationFunctionDetail } from '@smarteverything/domain';
import {
  bodyLines,
  copyRequest,
  deleteRefusal,
  heroModel,
  interfaceCard,
  usedByGroups,
} from './detail-model';

function detail(over: Partial<AutomationFunctionDetail> = {}): AutomationFunctionDetail {
  return {
    id: 'fn-1',
    name: 'Cycle brightness',
    description: 'Steps through levels',
    category: null,
    icon: null,
    builtin: false,
    editable: true,
    revision: 4,
    interface: {
      flavour: 'action',
      inputs: [
        { name: 'lights', type: { t: 'any' }, required: true },
        { name: 'step', label: 'Step', type: { t: 'number' }, required: false, default: 25 },
        { name: 'note', type: { t: 'text' }, required: false },
      ],
      outputs: [
        { name: 'level', type: { t: 'number' } },
        { name: 'maybe', type: { t: 'text' }, optional: true },
      ],
      exits: ['done', 'failed'],
    },
    interfaceHash: 'h',
    users: 2,
    createdBy: 'me',
    updatedAt: null,
    program: FUNCTION_V3.parse({
      version: 3,
      kind: 'function',
      flavour: 'action',
      inputs: [],
      outputs: [],
      exits: ['done'],
      variables: [],
      body: {
        nodes: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            key: 'each_light',
            kind: 'flow.if',
            label: 'Each light',
            branches: [
              {
                id: '33333333-3333-4333-8333-333333333333',
                when: { lit: true },
                scope: {
                  nodes: [
                    {
                      id: '22222222-2222-4222-8222-222222222222',
                      key: 'set_level',
                      kind: 'var.set',
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    }),
    layout: { nodes: {}, frames: [], comments: [] },
    usedBy: [
      { kind: 'automation', id: 'a', name: 'Night' },
      { kind: 'function', id: 'b', name: 'Wrap' },
    ],
    ...over,
  };
}

describe('detail model', () => {
  it('describes inputs, outputs and exits with types and requirements', () => {
    const card = interfaceCard(detail().interface);
    expect(card.inputs.map((line) => line.requirement)).toEqual([
      'Required',
      'Default 25',
      'Optional',
    ]);
    expect(card.inputs[1]?.title).toBe('Step');
    expect(card.outputs.map((line) => line.requirement)).toEqual([
      'Always given',
      'Only sometimes',
    ]);
    expect(card.exits.map((exit) => exit.name)).toEqual(['done', 'failed']);
  });

  it('refuses delete while in use and for built-ins', () => {
    expect(deleteRefusal(detail())).toBe('It is used in 2 places. Remove it from them first.');
    expect(deleteRefusal(detail({ usedBy: [] }))).toBeNull();
    expect(deleteRefusal(detail({ builtin: true, usedBy: [] }))).toContain('Built-in');
  });

  it('gates hero actions on ownership', () => {
    const own = heroModel(detail(), 'me');
    expect(own).toMatchObject({ ownership: 'mine', canEdit: true, versionLabel: 'Version 4' });
    const builtin = heroModel(detail({ builtin: true, editable: false }), 'me');
    expect(builtin).toMatchObject({ ownership: 'builtin', canEdit: false, canDelete: false });
    expect(heroModel(detail({ createdBy: 'other' }), 'me').ownership).toBe('shared');
  });

  it('groups users and summarises them', () => {
    const groups = usedByGroups(detail());
    expect(groups.automations).toHaveLength(1);
    expect(groups.summary).toBe('1 automation and 1 Custom Node');
    expect(usedByGroups(detail({ usedBy: [] })).summary).toBe('Not used yet');
  });

  it('lists body steps with their depth', () => {
    expect(bodyLines(detail().program)).toEqual([
      { key: 'each_light', depth: 0, text: 'Each light' },
      { key: 'set_level', depth: 1, text: 'set_level' },
    ]);
  });

  it('copies the body into a create request', () => {
    const request = copyRequest(detail());
    expect(request.name).toBe('Cycle brightness copy');
    expect(request.definition.kind).toBe('function');
  });
});
