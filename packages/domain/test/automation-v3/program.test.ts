import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PORT_VALUE } from '../../src/automation-v3/port-value';
import {
  NODE,
  NODE_KIND_ID,
  SCOPE,
  STRUCTURED_OUTPUT,
  SWITCH_MATCH,
  TRIGGER_KIND_ID,
  TRIGGER_NODE,
} from '../../src/automation-v3/node';
import { childScopes, visitNodes } from '../../src/automation-v3/scope';
import {
  AUTOMATION_V3,
  FUNCTION_V3,
  PROGRAM_V3,
  type AutomationV3,
} from '../../src/automation-v3/program';
import * as domain from '../../src';
import { automationV3, functionV3 } from '../support/automation-v3-arbitraries';

const ID_A = '00000000-0000-4000-8000-00000000000a';
const ID_B = '00000000-0000-4000-8000-00000000000b';
const ID_C = '00000000-0000-4000-8000-00000000000c';

const minimal: AutomationV3 = {
  version: 3,
  kind: 'automation',
  triggers: [],
  inputs: [],
  outputs: [],
  variables: [],
  body: { nodes: [] },
  policy: { mode: 'single' },
};

describe('port values', () => {
  it('accepts a constant or a wire', () => {
    expect(PORT_VALUE.parse({ lit: { a: [1, null] } })).toEqual({ lit: { a: [1, null] } });
    expect(PORT_VALUE.parse({ lit: null })).toEqual({ lit: null });
    expect(PORT_VALUE.parse({ wire: { from: 'trigger', port: 'key' } })).toEqual({
      wire: { from: 'trigger', port: 'key' },
    });
  });

  it('rejects a wire without a port, a bare value, two tags and unknown tags', () => {
    const wire = { from: 'a', port: 'b' };
    for (const value of [
      { wire: { from: 'a' } },
      { wire: 'a.b' },
      { wire: { from: 'A b', port: 'c' } },
      5,
      'a.b',
      { lit: 1, wire },
      { raw: 1 },
      {},
    ]) {
      expect(PORT_VALUE.safeParse(value).success).toBe(false);
    }
  });

  it('rejects a literal that is not JSON', () => {
    expect(PORT_VALUE.safeParse({ lit: Number.NaN }).success).toBe(false);
  });
});

describe('kind ids', () => {
  it('needs dotted lowercase words', () => {
    expect(NODE_KIND_ID.safeParse('flow.if').success).toBe(true);
    expect(NODE_KIND_ID.safeParse('timing.rate_limit').success).toBe(true);
    for (const id of ['flow', 'Flow.if', 'flow.', 'flow.If', '1flow.if', 'fn:abc']) {
      expect(NODE_KIND_ID.safeParse(id).success).toBe(false);
    }
  });

  it('marks trigger kinds by prefix', () => {
    expect(TRIGGER_KIND_ID.safeParse('trigger.signal').success).toBe(true);
    expect(TRIGGER_KIND_ID.safeParse('flow.if').success).toBe(false);
  });
});

describe('nodes and scopes', () => {
  it('parses a node with every optional field', () => {
    const node = {
      id: ID_A,
      key: 'setLight',
      kind: 'device.set',
      ports: { level: { lit: 50 } },
      policy: { onError: 'continue' },
      label: 'Light',
      note: 'Dim it',
      enabled: false,
    };
    expect(NODE.parse(node)).toEqual(node);
  });

  it('rejects a non-uuid id, a reserved key and unknown fields', () => {
    const base = { id: ID_A, key: 'a', kind: 'device.set' };
    expect(NODE.safeParse(base).success).toBe(true);
    expect(NODE.safeParse({ ...base, id: 'x' }).success).toBe(false);
    expect(NODE.safeParse({ ...base, key: 'vars' }).success).toBe(false);
    expect(NODE.safeParse({ ...base, extra: 1 }).success).toBe(false);
    expect(NODE.safeParse({ ...base, pin: { revision: 0 } }).success).toBe(false);
    expect(NODE.safeParse({ ...base, label: '' }).success).toBe(false);
  });

  it('keeps nested scopes, branches, cases and catches', () => {
    const inner = { nodes: [{ id: ID_B, key: 'b', kind: 'device.set' }] };
    const node = {
      id: ID_A,
      key: 'a',
      kind: 'flow.try',
      scopes: { try: inner, else: inner },
      branches: [{ id: ID_C, when: { lit: true }, scope: inner }],
      cases: [{ id: ID_C, match: { in: [1, 2] }, scope: inner }],
      catches: [{ id: ID_C, classes: ['Timeout'], scope: inner }],
    };
    expect(NODE.parse(node)).toEqual(node);
  });

  it('allows keyword scope names but refuses bad ones', () => {
    expect(SCOPE.safeParse({ nodes: [] }).success).toBe(true);
    const node = (name: string): unknown => ({
      id: ID_A,
      key: 'a',
      kind: 'flow.if',
      scopes: { [name]: { nodes: [] } },
    });
    expect(NODE.safeParse(node('else')).success).toBe(true);
    expect(NODE.safeParse(node('Else')).success).toBe(false);
  });

  it('refuses a branch list that is empty and a catch of an uncatchable class', () => {
    const base = { id: ID_A, key: 'a', kind: 'flow.if' };
    expect(NODE.safeParse({ ...base, branches: [] }).success).toBe(false);
    const caught = (classes: string[]): unknown => ({
      ...base,
      kind: 'flow.try',
      catches: [{ id: ID_B, classes, scope: { nodes: [] } }],
    });
    expect(NODE.safeParse(caught(['Cancelled'])).success).toBe(false);
    expect(NODE.safeParse(caught([])).success).toBe(false);
  });

  it('parses every switch match form', () => {
    for (const match of [
      { eq: 'a' },
      { eq: null },
      { in: ['a', 'b'] },
      { range: { min: 1 } },
      { range: { max: 5 } },
      { range: { min: 1, max: 5 } },
      { when: { wire: { from: 'above', port: 'result' } } },
    ]) {
      expect(SWITCH_MATCH.parse(match)).toEqual(match);
    }
  });

  it('refuses an empty list, an empty range and a reversed range', () => {
    for (const match of [{ in: [] }, { range: {} }, { range: { min: 5, max: 1 } }]) {
      expect(SWITCH_MATCH.safeParse(match).success).toBe(false);
    }
  });

  it('needs at least one scope value in a structured output', () => {
    const ok = { name: 'result', type: { t: 'number' }, values: { then: { lit: 1 } } };
    expect(STRUCTURED_OUTPUT.parse(ok)).toEqual(ok);
    expect(STRUCTURED_OUTPUT.safeParse({ name: 'result', values: {} }).success).toBe(false);
  });

  it('lists child scopes of every container family in order', () => {
    const scope = { nodes: [] };
    const node = NODE.parse({
      id: ID_A,
      key: 'a',
      kind: 'flow.if',
      scopes: { else: scope },
      branches: [{ id: ID_B, when: { lit: true }, scope }],
      cases: [{ id: ID_C, match: { eq: 1 }, scope }],
      catches: [{ id: ID_C, scope }],
    });
    expect(childScopes(node).map((child) => child.path)).toEqual([
      ['scopes', 'else'],
      ['branches', 0, 'scope'],
      ['cases', 0, 'scope'],
      ['catches', 0, 'scope'],
    ]);
    expect(childScopes(NODE.parse({ id: ID_A, key: 'a', kind: 'device.set' }))).toEqual([]);
  });

  it('visits nested nodes depth first with their paths', () => {
    const inner = { nodes: [{ id: ID_B, key: 'b', kind: 'device.set' }] };
    const scope = SCOPE.parse({
      nodes: [
        { id: ID_A, key: 'a', kind: 'flow.repeat', scopes: { body: inner } },
        { id: ID_C, key: 'c', kind: 'device.set' },
      ],
    });
    expect(visitNodes(scope, ['body']).map((v) => [v.node.key, v.path])).toEqual([
      ['a', ['body', 'nodes', 0]],
      ['b', ['body', 'nodes', 0, 'scopes', 'body', 'nodes', 0]],
      ['c', ['body', 'nodes', 1]],
    ]);
  });
});

describe('triggers', () => {
  it('parses a trigger with its ports, label and note', () => {
    const trigger = {
      id: ID_A,
      key: 'press',
      kind: 'trigger.button',
      ports: { press: { lit: 'single_press' } },
      label: 'Press',
      note: 'x',
      enabled: true,
    };
    expect(TRIGGER_NODE.parse(trigger)).toEqual(trigger);
  });

  it('rejects a trigger without ports or with a node kind', () => {
    expect(TRIGGER_NODE.safeParse({ id: ID_A, key: 'a', kind: 'trigger.time' }).success).toBe(
      false,
    );
    expect(TRIGGER_NODE.safeParse({ id: ID_A, key: 'a', kind: 'flow.if', ports: {} }).success).toBe(
      false,
    );
  });
});

describe('programs', () => {
  it('parses the smallest automation', () => {
    expect(AUTOMATION_V3.parse(minimal)).toEqual(minimal);
  });

  it('round-trips every generated automation and function', () => {
    fc.assert(
      fc.property(automationV3, (program) => {
        expect(PROGRAM_V3.parse(program)).toEqual(program);
      }),
    );
    fc.assert(
      fc.property(functionV3, (program) => {
        expect(PROGRAM_V3.parse(program)).toEqual(program);
      }),
    );
  });

  it('chooses the schema by kind', () => {
    expect(PROGRAM_V3.parse(minimal).kind).toBe('automation');
    const fn = {
      version: 3,
      kind: 'function',
      flavour: 'pure',
      inputs: [],
      outputs: [],
      exits: ['done'],
      variables: [],
      body: { nodes: [] },
    };
    expect(PROGRAM_V3.parse(fn).kind).toBe('function');
    expect(PROGRAM_V3.safeParse({ ...fn, kind: 'other' }).success).toBe(false);
  });

  it('takes every optional automation field', () => {
    const full: AutomationV3 = {
      ...minimal,
      description: 'Lights',
      admit: { lit: true },
      onFailure: { nodes: [] },
      budgets: { startBucket: 'off', feedback: 'off', effects: 'off' },
      history: { detail: 'failures' },
    };
    expect(AUTOMATION_V3.parse(full)).toEqual(full);
  });

  it('is strict about version, kind and unknown fields', () => {
    expect(AUTOMATION_V3.safeParse({ ...minimal, version: 2 }).success).toBe(false);
    expect(AUTOMATION_V3.safeParse({ ...minimal, extra: 1 }).success).toBe(false);
    expect(AUTOMATION_V3.safeParse({ ...minimal, history: { detail: 'few' } }).success).toBe(false);
    const { policy, ...withoutPolicy } = minimal;
    expect(policy.mode).toBe('single');
    expect(AUTOMATION_V3.safeParse(withoutPolicy).success).toBe(false);
  });

  it('needs at least one exit on a function', () => {
    const fn = {
      version: 3,
      kind: 'function',
      flavour: 'action',
      description: 'd',
      category: 'c',
      icon: 'lamp',
      inputs: [],
      outputs: [],
      exits: [],
      variables: [],
      body: { nodes: [] },
    };
    expect(FUNCTION_V3.safeParse(fn).success).toBe(false);
    expect(FUNCTION_V3.safeParse({ ...fn, exits: ['done'] }).success).toBe(true);
  });

  it('is reachable from the domain index', () => {
    expect(domain.PROGRAM_V3).toBe(PROGRAM_V3);
    expect(domain.isAssignable).toBeTypeOf('function');
  });
});
