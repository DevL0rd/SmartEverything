import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import type { GraphNode } from '@smarteverything/domain';
import type { GraphProblem, GraphProblemCode } from '../../src/graph/problem-types';
import { structureProgram, type StructureResult } from '../../src/graph/structure';
import { GRAPH_PROBLEMS } from '../../src/graph/structure-problems';
import {
  TRUE,
  automation,
  flow,
  graphNode,
  idOf,
  ifNode,
  join,
  loop,
  plain,
  scope,
  start,
  step,
  stop,
  switchNode,
  together,
} from './graph-fixtures';

function structured(nodes: readonly GraphNode[]): Extract<StructureResult, { ok: true }> {
  const result = structureProgram(automation(nodes), STATIC_KIND_LOOKUP);
  if (!result.ok) throw new Error(result.problems.map((p) => p.message).join(' | '));
  return result;
}

function problemsOf(nodes: readonly GraphNode[]): readonly GraphProblem[] {
  const result = structureProgram(automation(nodes), STATIC_KIND_LOOKUP);
  if (result.ok) throw new Error('expected problems');
  return result.problems;
}

function only(nodes: readonly GraphNode[]): GraphProblem {
  const [first, ...rest] = problemsOf(nodes);
  expect(rest).toEqual([]);
  if (first === undefined) throw new Error('no problem');
  return first;
}

const named = (key: string, label: string, next?: string): GraphNode => step(key, next, { label });

describe('the problem table', () => {
  it('has one emitter for every code of the design', () => {
    const codes: readonly GraphProblemCode[] = [
      'wire_cycle',
      'crosses_region',
      'shared_branch_node',
      'path_not_joined',
      'join_mismatch',
      'exit_shape',
      'switch_all_early_end',
      'never_runs',
      'exec_into_start',
      'unknown_target',
      'loop_control_outside',
    ];
    expect(Object.keys(GRAPH_PROBLEMS).sort()).toEqual([...codes].sort());
  });
});

describe('wires and targets', () => {
  it('names the nodes of a circle of wires', () => {
    const problem = only([
      start('a'),
      named('a', 'Turn on', 'b'),
      named('b', 'Wait', 'c'),
      named('c', 'Turn off', 'b'),
    ]);
    expect(problem).toMatchObject({
      code: 'wire_cycle',
      message: 'These wires go round in a circle: Wait, Turn off, Wait.',
      fix: 'Use a loop node to repeat steps.',
    });
  });

  it('names a wire to a step that does not exist', () => {
    const problem = only([start('a'), named('a', 'Turn on', 'wait_9')]);
    expect(problem).toMatchObject({
      code: 'unknown_target',
      key: 'a',
      wire: { from: 'a', port: 'next' },
      message: 'Then of Turn on goes to wait_9, which does not exist.',
      fix: 'Pick a step that exists.',
    });
  });

  it('refuses a wire into Start', () => {
    const problem = only([start('a'), named('a', 'Turn on', 'start')]);
    expect(problem).toMatchObject({
      code: 'exec_into_start',
      key: 'start',
      wire: { from: 'a', port: 'next' },
      message: 'Nothing can lead into Start.',
      fix: 'Remove the wire; the editor does not allow it.',
    });
  });

  it('names a step nothing leads to', () => {
    const problem = only([start('a'), named('a', 'Turn on'), named('lonely', 'Flash red')]);
    expect(problem).toMatchObject({
      code: 'never_runs',
      key: 'lonely',
      message: 'Flash red never runs: nothing leads to it.',
      fix: 'Wire a Then into it, or delete it.',
    });
  });
});

describe('shared steps', () => {
  it('suggests an Or node for the short-circuit shape', () => {
    const problem = only([
      start('a'),
      ifNode('a', [{ name: 'yes', to: 'x' }], 'b'),
      ifNode('b', [{ name: 'yes', to: 'x' }], 'y'),
      named('x', 'Turn on', 'y'),
      named('y', 'Turn off'),
    ]);
    expect(problem).toMatchObject({
      code: 'shared_branch_node',
      key: 'x',
      wire: { from: 'b', port: `row:${idOf('b:yes')}` },
      fix: 'Combine the two conditions with an Or node and use one If.',
    });
    expect(problem.message).toBe(
      'Turn on is reached from both If of If and If of If, which do not meet at it.',
    );
  });

  it('names the guard that can end one branch early', () => {
    const guard = graphNode('g', 'flow.guard', {
      label: 'Only continue if',
      ports: { condition: TRUE },
      to: { next: 'x' },
    });
    const problem = only([
      start('dark'),
      { ...ifNode('dark', [{ name: 'yes', to: 'g' }], 'x'), label: 'If dark' },
      guard,
      named('x', 'Turn on'),
    ]);
    expect(problem).toMatchObject({
      code: 'shared_branch_node',
      key: 'x',
      message:
        'Turn on is reached from both If of If dark and Otherwise of If dark, but If of If dark can end early at Only continue if.',
      fix: 'Wire Otherwise of Only continue if to Turn on, or end both paths.',
    });
  });
});

describe('Do together', () => {
  it('names a path that ends before Wait for all', () => {
    const problem = only([
      start('t'),
      together('t', [
        { name: 'lights', to: 'a' },
        { name: 'tv', to: 'b' },
      ]),
      named('a', 'Turn on', 'w'),
      named('b', 'Pause'),
      join('w'),
    ]);
    expect(problem).toMatchObject({
      code: 'path_not_joined',
      key: 't',
      wire: { from: 't', port: 'path:tv' },
      message: 'Path tv of Do together ends before Wait for all.',
      fix: 'Wire its last step into Wait for all.',
    });
  });

  it('names an empty path that is not wired', () => {
    const problem = only([
      start('t'),
      together('t', [{ name: 'lights', to: 'a' }, { name: 'nothing' }]),
      named('a', 'Turn on', 'w'),
      join('w'),
    ]);
    expect(problem).toMatchObject({
      code: 'path_not_joined',
      message: 'Path nothing of Do together ends before Wait for all.',
    });
  });

  it('accepts a path that ends in a terminal', () => {
    const result = structured([
      start('t'),
      together('t', [
        { name: 'lights', to: 'a' },
        { name: 'bail', to: 'halt' },
      ]),
      named('a', 'Turn on', 'w'),
      stop('halt'),
      join('w'),
    ]);
    expect(result.tree.body.nodes.map((n) => n.key)).toEqual(['t']);
  });

  it('names a Wait for all that gets a wire from outside any Do together', () => {
    const problem = only([start('a'), named('a', 'Turn on', 'w'), join('w')]);
    expect(problem).toMatchObject({
      code: 'join_mismatch',
      key: 'w',
      wire: { from: 'a', port: 'next' },
      message:
        'Wait for all gets a wire from Then of Turn on, which is not a path of a Do together.',
      fix: 'Wire only the paths of one Do together into it.',
    });
  });

  it('names a Do together without any Wait for all', () => {
    const problem = only([
      start('t'),
      together('t', [{ name: 'lights', to: 'a' }]),
      named('a', 'Turn on'),
    ]);
    expect(problem).toMatchObject({
      code: 'join_mismatch',
      key: 't',
      message: 'Do together has no Wait for all: none of its paths lead to one.',
    });
  });

  it('turns a guard whose Otherwise goes to the Wait for all into a plain guard', () => {
    const guard = graphNode('g', 'flow.guard', {
      ports: { condition: TRUE, quietly: { lit: false } },
      to: { next: 'a', otherwise: 'w' },
    });
    const result = structured([
      start('t'),
      together('t', [
        { name: 'lights', to: 'g' },
        { name: 'tv', to: 'b' },
      ]),
      guard,
      step('a', 'w'),
      step('b', 'w'),
      join('w'),
    ]);
    const lights = result.tree.body.nodes[0]?.scopes?.['lights'];
    expect(lights).toEqual(
      scope(
        flow('g', 'flow.guard', { ports: { condition: TRUE, quietly: { lit: false } } }),
        plain('a'),
      ),
    );
  });
});

describe('Only continue if', () => {
  it('stays a plain guard at the top level with quietly', () => {
    const guard = graphNode('g', 'flow.guard', {
      ports: { condition: TRUE, quietly: { lit: true } },
      to: { next: 'a' },
    });
    const result = structured([start('g'), guard, step('a')]);
    expect(result.tree.body).toEqual(
      scope(
        flow('g', 'flow.guard', { ports: { condition: TRUE, quietly: { lit: true } } }),
        plain('a'),
      ),
    );
  });

  it('becomes a two-way If with its own id as the row id when Otherwise leads elsewhere', () => {
    const guard = graphNode('g', 'flow.guard', {
      ports: { condition: TRUE, quietly: { lit: true } },
      to: { next: 'a', otherwise: 'b' },
    });
    const result = structured([start('g'), guard, step('a', 'm'), step('b', 'm'), step('m')]);
    expect(result.tree.body).toEqual(
      scope(
        flow('g', 'flow.if', {
          branches: [{ id: idOf('g'), when: TRUE, scope: scope(plain('a')) }],
          scopes: { else: scope(plain('b')) },
        }),
        plain('m'),
      ),
    );
  });

  it('names a two-way guard that has no condition', () => {
    const guard = graphNode('g', 'flow.guard', { to: { next: 'a', otherwise: 'b' } });
    const problem = only([start('g'), guard, step('a', 'm'), step('b', 'm'), step('m')]);
    expect(problem).toMatchObject({
      code: 'exit_shape',
      key: 'g',
      message: 'Only continue if sends Otherwise to its own steps but has no condition.',
    });
  });
});

describe('memory node exits', () => {
  const cooldown = (to: Record<string, string>): GraphNode =>
    graphNode('cd', 'timing.cooldown', {
      label: 'At most once per 5 min',
      ports: { period: { lit: 300000 } },
      to,
    });

  it('has no lane when Blocked is unwired', () => {
    const result = structured([start('cd'), cooldown({ next: 'a' }), named('a', 'Turn on')]);
    expect(result.tree.body.nodes[0]).toMatchObject({ key: 'cd' });
    expect(result.tree.body.nodes[0]?.scopes).toBeUndefined();
  });

  it('has no lane when Blocked goes to the end of an If row', () => {
    const result = structured([
      start('decide'),
      ifNode('decide', [{ name: 'yes', to: 'cd' }], 'm'),
      cooldown({ next: 'a', blocked: 'm' }),
      step('a', 'm'),
      step('m'),
    ]);
    const row = result.tree.body.nodes[0]?.branches?.[0]?.scope;
    expect(row?.nodes.map((n) => [n.key, n.scopes])).toEqual([
      ['cd', undefined],
      ['a', undefined],
    ]);
  });

  it('gives an empty lane when Blocked goes straight to Then', () => {
    const result = structured([
      start('cd'),
      cooldown({ next: 'a', blocked: 'a' }),
      named('a', 'Turn on'),
    ]);
    expect(result.tree.body.nodes[0]?.scopes).toEqual({ blocked: scope() });
  });

  it('gives a lane when the Blocked path comes back to Then', () => {
    const result = structured([
      start('cd'),
      cooldown({ next: 'a', blocked: 'note' }),
      step('note', 'a'),
      named('a', 'Turn on'),
    ]);
    expect(result.tree.body.nodes[0]?.scopes).toEqual({ blocked: scope(plain('note')) });
    expect(result.tree.body.nodes.map((n) => n.key)).toEqual(['cd', 'a']);
  });

  it('allows a Blocked path that ends in a terminal', () => {
    const result = structured([
      start('cd'),
      cooldown({ next: 'a', blocked: 'halt' }),
      stop('halt'),
      named('a', 'Turn on'),
    ]);
    expect(result.tree.body.nodes[0]?.scopes).toEqual({
      blocked: scope(flow('halt', 'flow.stop')),
    });
  });

  it('names a Blocked path that ends without returning to Then', () => {
    const problem = only([
      start('cd'),
      cooldown({ next: 'a', blocked: 'note' }),
      step('note'),
      named('a', 'Turn on'),
    ]);
    expect(problem).toMatchObject({
      code: 'exit_shape',
      key: 'cd',
      wire: { from: 'cd', port: 'blocked' },
      message: 'Blocked of At most once per 5 min must lead back to Turn on or end.',
      fix: 'Wire the Blocked path back to Turn on, or leave it unwired.',
    });
  });
});

describe('Switch in Every match mode', () => {
  const every = (rows: { name: string; to?: string }[], otherwise?: string): GraphNode => ({
    ...switchNode('pick', rows, otherwise),
    label: 'Switch on mode',
    ports: { mode: { lit: 'all' } },
  });

  it('names a case that ends early while the others lead on', () => {
    const problems = problemsOf([
      start('pick'),
      every([{ name: 'bright', to: 'one' }, { name: 'dim', to: 'two' }, { name: 'off' }], 'three'),
      step('one', 'notify'),
      step('two', 'notify'),
      step('three', 'notify'),
      named('notify', 'Notify'),
    ]);
    expect(problems.find((p) => p.code === 'switch_all_early_end')).toMatchObject({
      key: 'pick',
      wire: { from: 'pick', port: `case:${idOf('pick:off')}` },
      message: 'Is off of Switch on mode ends early; every case must lead to Notify.',
      fix: 'Wire the case to Notify.',
    });
  });

  it('accepts cases that all lead to one step', () => {
    const result = structured([
      start('pick'),
      every([{ name: 'bright', to: 'one' }], 'notify'),
      step('one', 'notify'),
      step('notify'),
    ]);
    expect(result.tree.body.nodes.map((n) => n.key)).toEqual(['pick', 'notify']);
  });
});

describe('loop control', () => {
  it('names a Break outside any loop', () => {
    const problem = only([
      start('a'),
      named('a', 'Turn on', 'out'),
      graphNode('out', 'flow.break', { label: 'Break' }),
    ]);
    expect(problem).toMatchObject({
      code: 'loop_control_outside',
      key: 'out',
      message: 'Break is not inside a loop.',
      fix: 'Move it into the Each item path of a loop.',
    });
  });

  it('accepts a Break inside a loop body and inside an If in it', () => {
    const result = structured([
      start('l'),
      loop('l', 'flow.forever', 'decide'),
      ifNode('decide', [{ name: 'done', to: 'out' }], 'a'),
      graphNode('out', 'flow.break'),
      step('a'),
    ]);
    expect(result.tree.body.nodes.map((n) => n.key)).toEqual(['l']);
  });

  it('names a Next item inside a Do together path that sits in a loop', () => {
    const problem = only([
      start('l'),
      loop('l', 'flow.for_each', 't'),
      together('t', [
        { name: 'lights', to: 'skip' },
        { name: 'tv', to: 'a' },
      ]),
      graphNode('skip', 'flow.continue', { label: 'Next item' }),
      step('a', 'w'),
      join('w'),
    ]);
    expect(problem).toMatchObject({
      code: 'loop_control_outside',
      key: 'skip',
      message: 'Next item is inside a path of Do together, which cannot reach the loop around it.',
    });
  });
});
