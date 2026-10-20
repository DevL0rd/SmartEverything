import { describe, expect, it } from 'vitest';
import type { FlowNode, InputPort, Scope, SwitchMatch } from '@smarteverything/domain';
import { automation, wired, lit, node, scope, uuid } from './c23-support';
import { findings, keysOf, only } from './lint-support';

function switchOn(key: string, matches: SwitchMatch[], extra: Partial<FlowNode> = {}): FlowNode {
  return node(
    key,
    'flow.switch',
    { subject: wired('inputs.mode') },
    { cases: matches.map((match) => ({ id: uuid(), match, scope: scope() })), ...extra },
  );
}

const MODE: InputPort = {
  name: 'mode',
  type: {
    t: 'choice',
    options: [
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta' },
      { id: 'c', label: 'Gamma' },
    ],
  },
  required: true,
};

describe('lint of duplicate Switch values', () => {
  it('finds a value matched twice, in any form', () => {
    const program = automation([
      switchOn('s', [
        { eq: 1 },
        { eq: 1 },
        { in: [2, 3] },
        { in: [3] },
        { eq: { x: 1, y: [2] } },
        { in: [{ y: [2], x: 1 }] },
        { eq: null },
        { range: { min: 1 } },
        { when: lit(true) },
      ]),
    ]);
    const hits = only(findings(program), 'duplicate_switch_literal');
    expect(hits.map((item) => item.received)).toEqual(['1', '3', '{"x":1,"y":[2]}']);
  });

  it('accepts distinct values', () => {
    const found = findings(automation([switchOn('s', [{ eq: 1 }, { in: [2] }])]));
    expect(only(found, 'duplicate_switch_literal')).toEqual([]);
  });
});

describe('lint of a Switch over a choice', () => {
  it('names the choices no case handles', () => {
    const program = automation([switchOn('s', [{ eq: 'a' }])], { inputs: [MODE] });
    const hits = only(findings(program), 'switch_not_exhaustive');
    expect(hits.map((item) => item.received)).toEqual(['Beta, Gamma']);
  });

  it('accepts full cover, a default, optional input and non-choice subjects', () => {
    const covered = switchOn('s', [{ eq: 'a' }, { in: ['b', 'c'] }]);
    const withDefault = switchOn('d', [{ eq: 'a' }], { scopes: { default: scope() } });
    const optional = switchOn('o', [{ eq: 'a' }, { in: ['b', 'c'] }]);
    const found = findings(automation([covered, withDefault, optional], { inputs: [MODE] }));
    expect(only(found, 'switch_not_exhaustive')).toEqual([]);
    const loose = findings(
      automation([switchOn('l', [{ eq: 'a' }])], { inputs: [{ ...MODE, required: false }] }),
    );
    expect(keysOf(loose, 'switch_not_exhaustive')).toEqual(['l']);
  });

  it('names every choice for a Switch with no cases', () => {
    const bare = node('bare', 'flow.switch', { subject: wired('inputs.mode') });
    const found = findings(automation([bare], { inputs: [MODE] }));
    expect(only(found, 'switch_not_exhaustive').map((item) => item.received)).toEqual([
      'Alpha, Beta, Gamma',
    ]);
  });

  it('skips a subject that is fixed, unknown, missing or not a choice', () => {
    const fixed = node('f', 'flow.switch', { subject: lit('a') });
    const unknown = node('u', 'flow.switch', { subject: wired('ghost.value') });
    const missing = node('m', 'flow.switch');
    const text = node('t', 'flow.switch', { subject: wired('home.name') });
    const found = findings(automation([fixed, unknown, missing, text]));
    expect(only(found, 'switch_not_exhaustive')).toEqual([]);
  });
});

const TESTS = new Map<string, FlowNode>();

function equals(key: string, variable: string, value: number): FlowNode {
  const test = node(key, 'logic.compare', {
    a: wired(`vars.${variable}`),
    op: lit('eq'),
    b: lit(value),
  });
  TESTS.set(key, test);
  return test;
}

function chain(
  key: string,
  count: number,
  setting: (index: number) => FlowNode,
  variable = 'level',
): FlowNode {
  const branches = Array.from({ length: count }, (_unused, index) => ({
    id: uuid(),
    when: wired(`${equals(`${key}Is${String(index)}`, variable, index).key}.result`),
    scope: scope(setting(index)),
  }));
  return node(key, 'flow.if', {}, { branches });
}

function withTests(nodes: readonly FlowNode[]): FlowNode[] {
  const used = nodes.flatMap((entry) =>
    (entry.branches ?? []).flatMap((row) => {
      const test = 'wire' in row.when ? TESTS.get(row.when.wire.from) : undefined;
      return test === undefined ? [] : [test];
    }),
  );
  return [...used, ...nodes];
}

const setLevel = (index: number): FlowNode =>
  node(`set${String(index)}`, 'var.set', { name: lit('level'), to: lit(index) });

const LEVEL = { name: 'level', type: { t: 'number' } as const, initial: lit(0) };

describe('lint of long If chains', () => {
  it('suggests Next when every branch sets the same variable', () => {
    const found = findings(
      automation(withTests([chain('c', 5, setLevel)]), { variables: [LEVEL] }),
    );
    expect(only(found, 'if_chain_over_variable')[0]?.fix?.action).toEqual({
      action: 'cycle_variable',
      key: 'c',
      variable: 'level',
    });
  });

  it('suggests a lookup table otherwise', () => {
    const feed = (index: number): FlowNode =>
      node(`n${String(index)}`, 'notify.feed', { message: lit('x') });
    const wrongName = (index: number): FlowNode =>
      node(`w${String(index)}`, 'var.set', { name: lit('other'), to: lit(index) });
    const home = (index: number): FlowNode =>
      node(`h${String(index)}`, 'var.set', {
        name: lit('level'),
        source: lit('home'),
        to: lit(index),
      });
    const found = findings(
      automation(
        withTests([
          chain('a', 5, feed),
          chain('b', 6, wrongName),
          chain('h', 5, home),
          chain('two', 5, (index) => ({ ...setLevel(index) }), 'level'),
        ]),
      ),
    );
    const hits = only(found, 'if_chain_over_variable');
    expect(hits.map((item) => item.fix?.action?.action)).toEqual([
      'lookup_table',
      'lookup_table',
      'lookup_table',
      'cycle_variable',
    ]);
  });

  it('treats a branch with two steps as a lookup case', () => {
    const two: Scope = scope(setLevel(0), setLevel(1));
    const program = automation(withTests([chain('c', 5, setLevel)]));
    const first = program.body.nodes.find((entry) => entry.key === 'c')?.branches?.[0];
    if (first !== undefined) first.scope = two;
    expect(only(findings(program), 'if_chain_over_variable')[0]?.fix?.action?.action).toBe(
      'lookup_table',
    );
  });

  it('ignores short chains, mixed variables, other tests and empty Ifs', () => {
    const mixed = chain('mixed', 5, setLevel);
    const odd = mixed.branches?.[2];
    if (odd !== undefined) odd.when = wired(`${equals('otherIs2', 'other', 2).key}.result`);
    const fixed = chain('fixed', 5, setLevel);
    const first = fixed.branches?.[0];
    if (first !== undefined) first.when = lit(true);
    const empty = node('empty', 'flow.if', {}, { branches: [] });
    const bare = node('bare', 'flow.if');
    const found = findings(
      automation(withTests([chain('short', 4, setLevel), mixed, fixed, empty, bare])),
    );
    expect(only(found, 'if_chain_over_variable')).toEqual([]);
  });
});

describe('lint of unreachable steps', () => {
  it('flags every step after a step that always ends the path', () => {
    const program = automation([
      node('stop', 'flow.stop', {}),
      node('a', 'notify.feed', { message: lit('a') }),
      node('b', 'notify.feed', { message: lit('b') }),
    ]);
    expect(keysOf(findings(program), 'unreachable_node')).toEqual(['a', 'b']);
  });

  it('keeps scopes apart', () => {
    const inner = node(
      'when',
      'flow.if',
      {},
      {
        branches: [
          {
            id: uuid(),
            when: lit(true),
            scope: scope(
              node('ret', 'flow.return'),
              node('dead', 'notify.feed', { message: lit('x') }),
            ),
          },
        ],
      },
    );
    const program = automation([inner, node('alive', 'notify.feed', { message: lit('y') })]);
    expect(keysOf(findings(program), 'unreachable_node')).toEqual(['dead']);
  });
});
