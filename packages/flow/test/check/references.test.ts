import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { AutomationV3, FlowNode } from '@smarteverything/domain';
import { automationV3, functionV3 } from '../../../domain/test/support/automation-v3-arbitraries';
import {
  entryReferences,
  portValueReferences,
  programLevelReferences,
  referencedKeys,
  wireOf,
} from '../../src/check/references';
import type { Entry } from '../../src/program/lookup';
import { indexProgram } from '../../src/program/lookup';

const ID = '00000000-0000-4000-8000-000000000001';
const ROW = '00000000-0000-4000-8000-000000000002';

function node(fields: Partial<FlowNode>): FlowNode {
  return { id: ID, key: 'owner', kind: 'device.set', ...fields };
}

function entryOf(flow: FlowNode): Entry {
  const index = indexProgram({
    version: 3,
    kind: 'function',
    flavour: 'action',
    inputs: [],
    outputs: [],
    exits: ['done'],
    variables: [],
    body: { nodes: [flow] },
  });
  const entry = index.byKey.get(flow.key);
  if (entry === undefined) throw new Error('missing entry');
  return entry;
}

describe('portValueReferences', () => {
  it('finds nothing in a constant, even one that looks like a reference', () => {
    expect(portValueReferences({ lit: 'motion.value' })).toEqual([]);
    expect(portValueReferences({ lit: null })).toEqual([]);
    expect(wireOf({ lit: 1 })).toBeUndefined();
  });

  it('gives the wire itself', () => {
    const wire = { from: 'motion', port: 'value' };
    expect(portValueReferences({ wire })).toEqual([wire]);
    expect(wireOf({ wire })).toEqual(wire);
  });
});

describe('entryReferences', () => {
  it('reads ports, branch conditions, case conditions and structured outputs of a node', () => {
    const flow = node({
      kind: 'flow.switch',
      ports: { subject: { wire: { from: 'a', port: 'value' } }, mode: { lit: 'first' } },
      branches: [{ id: ROW, when: { wire: { from: 'b', port: 'value' } }, scope: { nodes: [] } }],
      cases: [
        { id: ROW, match: { eq: 1 }, scope: { nodes: [] } },
        { id: ROW, match: { in: [1, 2] }, scope: { nodes: [] } },
        { id: ROW, match: { range: { min: 1 } }, scope: { nodes: [] } },
        { id: ROW, match: { when: { wire: { from: 'c', port: 'value' } } }, scope: { nodes: [] } },
      ],
      outputs: [
        {
          name: 'level',
          values: { body: { wire: { from: 'd', port: 'value' } }, other: { lit: 1 } },
        },
      ],
    });
    const found = entryReferences(entryOf(flow));
    expect(found.map((reference) => [reference.from, reference.site])).toEqual([
      ['a', { kind: 'port', port: 'subject' }],
      ['b', { kind: 'branch', id: ROW }],
      ['c', { kind: 'case', id: ROW }],
      ['d', { kind: 'output', name: 'level', scope: 'body' }],
    ]);
  });

  it('reads the ports of a trigger', () => {
    const index = indexProgram({
      version: 3,
      kind: 'automation',
      triggers: [
        {
          id: ID,
          key: 'press',
          kind: 'trigger.signal',
          ports: { at: { wire: { from: 'vars', port: 'window' } } },
        },
        { id: ROW, key: 'plain', kind: 'trigger.time', ports: { at: { lit: '07:00' } } },
      ],
      inputs: [],
      outputs: [],
      variables: [],
      body: { nodes: [] },
      policy: { mode: 'single' },
    });
    const [press, plain] = ['press', 'plain'].map((key) => index.byKey.get(key));
    if (press === undefined || plain === undefined) throw new Error('missing trigger');
    expect(entryReferences(press).map((reference) => reference.site)).toEqual([
      { kind: 'port', port: 'at' },
    ]);
    expect(entryReferences(plain)).toEqual([]);
  });

  it('finds nothing in a node without values', () => {
    expect(entryReferences(entryOf(node({})))).toEqual([]);
  });
});

describe('programLevelReferences', () => {
  it('reads the admit condition and variable initial values', () => {
    const program: AutomationV3 = {
      version: 3,
      kind: 'automation',
      triggers: [],
      admit: { wire: { from: 'home', port: 'dark' } },
      inputs: [],
      outputs: [],
      variables: [
        { name: 'count', type: { t: 'number' }, initial: { lit: 0 } },
        {
          name: 'copy',
          type: { t: 'number' },
          initial: { wire: { from: 'inputs', port: 'start' } },
        },
      ],
      body: { nodes: [] },
      policy: { mode: 'single' },
    };
    const found = programLevelReferences(program);
    expect(found.map((reference) => [reference.from, reference.site])).toEqual([
      ['home', { kind: 'admit' }],
      ['inputs', { kind: 'variable', name: 'copy' }],
    ]);
  });

  it('reads only the variables of a reusable node', () => {
    const found = programLevelReferences({
      version: 3,
      kind: 'function',
      flavour: 'pure',
      inputs: [],
      outputs: [],
      exits: ['done'],
      variables: [
        {
          name: 'copy',
          type: { t: 'number' },
          initial: { wire: { from: 'inputs', port: 'start' } },
        },
      ],
      body: { nodes: [] },
    });
    expect(found).toHaveLength(1);
  });
});

describe('referencedKeys', () => {
  it('lists each source once', () => {
    const found = [
      { from: 'a', port: 'b' },
      { from: 'a', port: 'c' },
      { from: 'd', port: 'e' },
    ];
    expect([...referencedKeys(found)]).toEqual(['a', 'd']);
  });
});

describe('over generated programs', () => {
  it('never throws and only names plain sources', () => {
    fc.assert(
      fc.property(fc.oneof(automationV3, functionV3), (program) => {
        const index = indexProgram(program);
        for (const entry of index.nodes) {
          for (const reference of entryReferences(entry)) {
            expect(reference.from).toMatch(/^[a-z][A-Za-z0-9_]*$/);
          }
        }
        expect(programLevelReferences(program)).toEqual(expect.any(Array));
      }),
    );
  });
});
