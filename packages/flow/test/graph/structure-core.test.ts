import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { structureProgram, pathKey, type StructureResult } from '../../src/graph/structure';
import type { GraphProblem } from '../../src/graph/problem-types';
import {
  TRUE,
  automation,
  flow,
  giveBack,
  graphNode,
  idOf,
  ifNode,
  join,
  loop,
  onFailure,
  plain,
  scope,
  start,
  step,
  stop,
  switchNode,
  together,
  tryNode,
  value,
} from './graph-fixtures';
import type { GraphNode, Scope } from '@smarteverything/domain';

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

function bodyOf(nodes: readonly GraphNode[]): Scope {
  return structured(nodes).tree.body;
}

describe('plain chains and decisions', () => {
  it('turns a straight chain into one scope in wire order', () => {
    const result = structured([start('a'), step('a', 'b'), step('b', 'c'), step('c')]);
    expect(result.tree.body).toEqual(scope(plain('a'), plain('b'), plain('c')));
    expect(result.tree.version).toBe(3);
    expect(result.map.get(pathKey(['body', 'nodes', 1]))).toMatchObject({ key: 'b' });
    expect(result.map.get(pathKey(['body']))).toMatchObject({ key: 'start', port: 'next' });
  });

  it('rebuilds an If whose branches meet at a merge', () => {
    const body = bodyOf([
      start('decide'),
      ifNode('decide', [{ name: 'dark', to: 'x' }], 'y'),
      step('x', 'merge'),
      step('y', 'merge'),
      step('merge', 'after'),
      step('after'),
    ]);
    expect(body).toEqual(
      scope(
        flow('decide', 'flow.if', {
          branches: [{ id: idOf('decide:dark'), when: TRUE, scope: scope(plain('x')) }],
          scopes: { else: scope(plain('y')) },
        }),
        plain('merge'),
        plain('after'),
      ),
    );
  });

  it('keeps the rest of the run inside the other branch when one branch ends early', () => {
    const body = bodyOf([
      start('decide'),
      ifNode('decide', [{ name: 'yes', to: 'early' }], 'b'),
      step('early'),
      step('b', 'c'),
      step('c'),
    ]);
    expect(body).toEqual(
      scope(
        flow('decide', 'flow.if', {
          branches: [{ id: idOf('decide:yes'), when: TRUE, scope: scope(plain('early')) }],
          scopes: { else: scope(plain('b'), plain('c')) },
        }),
      ),
    );
  });

  it('treats a branch that stops the run as ending without moving the merge', () => {
    const body = bodyOf([
      start('decide'),
      ifNode('decide', [{ name: 'bad', to: 'halt' }], 'ok'),
      stop('halt'),
      step('ok', 'after'),
      step('after'),
    ]);
    expect(body).toEqual(
      scope(
        flow('decide', 'flow.if', {
          branches: [
            { id: idOf('decide:bad'), when: TRUE, scope: scope(flow('halt', 'flow.stop')) },
          ],
        }),
        plain('ok'),
        plain('after'),
      ),
    );
  });

  it('merges decisions at a final Return that every path reaches', () => {
    const body = bodyOf([
      start('outer'),
      ifNode('outer', [{ name: 'row', to: 'inner' }], 'ret'),
      ifNode('inner', [{ name: 'a', to: 'one' }], 'two'),
      step('one', 'ret'),
      step('two', 'ret'),
      giveBack('ret'),
    ]);
    expect(body).toEqual(
      scope(
        flow('outer', 'flow.if', {
          branches: [
            {
              id: idOf('outer:row'),
              when: TRUE,
              scope: scope(
                flow('inner', 'flow.if', {
                  branches: [{ id: idOf('inner:a'), when: TRUE, scope: scope(plain('one')) }],
                  scopes: { else: scope(plain('two')) },
                }),
              ),
            },
          ],
        }),
        flow('ret', 'flow.return'),
      ),
    );
  });

  it('merges a Switch at a final Return and still lets a lone Stop end early', () => {
    const body = bodyOf([
      start('guarded'),
      ifNode('guarded', [{ name: 'bad', to: 'halt' }], 'pick'),
      stop('halt'),
      switchNode('pick', [{ name: 'a', to: 'one' }], 'two'),
      step('one', 'ret'),
      step('two', 'ret'),
      giveBack('ret'),
    ]);
    expect(body).toEqual(
      scope(
        flow('guarded', 'flow.if', {
          branches: [
            { id: idOf('guarded:bad'), when: TRUE, scope: scope(flow('halt', 'flow.stop')) },
          ],
        }),
        flow('pick', 'flow.switch', {
          cases: [{ id: idOf('pick:a'), match: { eq: 'a' }, scope: scope(plain('one')) }],
          scopes: { default: scope(plain('two')) },
        }),
        flow('ret', 'flow.return'),
      ),
    );
  });

  it('gives an empty scope to a row that goes straight to the merge', () => {
    const body = bodyOf([
      start('decide'),
      ifNode('decide', [{ name: 'skip', to: 'merge' }], 'y'),
      step('y', 'merge'),
      step('merge'),
    ]);
    expect(body).toEqual(
      scope(
        flow('decide', 'flow.if', {
          branches: [{ id: idOf('decide:skip'), when: TRUE, scope: scope() }],
          scopes: { else: scope(plain('y')) },
        }),
        plain('merge'),
      ),
    );
  });

  it('rebuilds a Switch with its default and the merge after it', () => {
    const body = bodyOf([
      start('pick'),
      switchNode(
        'pick',
        [
          { name: 'a', to: 'one' },
          { name: 'b', to: 'two' },
        ],
        'other',
      ),
      step('one', 'merge'),
      step('two', 'merge'),
      step('other', 'merge'),
      step('merge'),
    ]);
    expect(body).toEqual(
      scope(
        flow('pick', 'flow.switch', {
          cases: [
            { id: idOf('pick:a'), match: { eq: 'a' }, scope: scope(plain('one')) },
            { id: idOf('pick:b'), match: { eq: 'b' }, scope: scope(plain('two')) },
          ],
          scopes: { default: scope(plain('other')) },
        }),
        plain('merge'),
      ),
    );
  });
});

describe('owners and lanes', () => {
  it.each([
    'flow.for_each',
    'flow.repeat',
    'flow.for_range',
    'flow.while',
    'flow.do_until',
    'flow.forever',
  ])('maps the body lane and When done of %s', (kind) => {
    const body = bodyOf([
      start('l'),
      loop('l', kind, 'inside', 'after'),
      step('inside'),
      step('after'),
    ]);
    expect(body).toEqual(
      scope(flow('l', kind, { scopes: { body: scope(plain('inside')) } }), plain('after')),
    );
  });

  it('keeps an empty body lane and a routed If it fails lane', () => {
    const routed = step('send', 'after', { policy: { onError: 'route' }, to: { next: 'after' } });
    const body = bodyOf([
      start('l'),
      loop('l', 'flow.forever', undefined, 'send'),
      routed,
      step('after'),
    ]);
    expect(body).toEqual(
      scope(
        flow('l', 'flow.forever', { scopes: { body: scope() } }),
        plain('send', { policy: { onError: 'route' }, scopes: { onError: scope() } }),
        plain('after'),
      ),
    );
  });

  it('maps Try, two catch rows and Finally', () => {
    const body = bodyOf([
      start('t'),
      tryNode('t', {
        attempt: 'a',
        catches: [
          { name: 'one', to: 'c1' },
          { name: 'two', to: 'c2' },
        ],
        finally: 'f',
        next: 'z',
      }),
      step('a'),
      step('c1'),
      step('c2'),
      step('f'),
      step('z'),
    ]);
    expect(body).toEqual(
      scope(
        flow('t', 'flow.try', {
          catches: [
            { id: idOf('t:one'), scope: scope(plain('c1')) },
            { id: idOf('t:two'), scope: scope(plain('c2')) },
          ],
          scopes: { try: scope(plain('a')), finally: scope(plain('f')) },
        }),
        plain('z'),
      ),
    );
  });

  it('omits an unwired Finally but keeps the Try lane', () => {
    const body = bodyOf([start('t'), tryNode('t', { attempt: 'a', catches: [] }), step('a')]);
    expect(body).toEqual(
      scope(flow('t', 'flow.try', { catches: [], scopes: { try: scope(plain('a')) } })),
    );
  });

  it('rebuilds the Baby crying shape of the design with the value node unplaced', () => {
    const playing = { wire: { from: 'is_playing', port: 'yes' } };
    const rows = [{ name: 'playing', to: 'pause_tv' }];
    const result = structured([
      start('notify'),
      step('notify', 'together'),
      together('together', [
        { name: 'lights', to: 'flash' },
        { name: 'pause', to: 'if_playing' },
      ]),
      step('flash', 'together_join'),
      {
        ...ifNode('if_playing', rows, 'together_join'),
        branches: [{ id: idOf('if_playing:playing'), when: playing, to: 'pause_tv' }],
      },
      step('pause_tv', 'together_join'),
      join('together_join', 'restore'),
      step('restore'),
      value('is_playing'),
    ]);
    expect(result.tree.body).toEqual(
      scope(
        plain('notify'),
        flow('together', 'flow.parallel', {
          scopes: {
            lights: scope(plain('flash')),
            pause: scope(
              flow('if_playing', 'flow.if', {
                branches: [
                  {
                    id: idOf('if_playing:playing'),
                    when: playing,
                    scope: scope(plain('pause_tv')),
                  },
                ],
              }),
            ),
          },
        }),
        plain('restore'),
      ),
    );
    expect(result.values).toEqual([flow('is_playing', 'device.get')]);
  });

  it('structures the On failure chain into onFailure', () => {
    const result = structured([start('a'), step('a'), onFailure('alarm'), step('alarm')]);
    expect(result.tree).toMatchObject({ onFailure: scope(plain('alarm')) });
  });
});

describe('problems', () => {
  it('rejects a path that leads out of a loop into a node coming from outside', () => {
    const problems = problemsOf([
      start('decide'),
      ifNode('decide', [{ name: 'go', to: 'l' }], 'b'),
      loop('l', 'flow.for_each', 'a'),
      step('a', 'b'),
      step('b'),
    ]);
    expect(problems.map((p) => p.code)).toEqual(['crosses_region']);
    expect(problems[0]?.key).toBe('b');
    expect(problems[0]?.message).toContain('comes in from outside');
  });

  it('rejects a catch row and Finally that lead to the same step', () => {
    const problems = problemsOf([
      start('t'),
      tryNode('t', { attempt: 'a', catches: [{ name: 'one', to: 'x' }], finally: 'x' }),
      step('a'),
      step('x'),
    ]);
    expect(problems.map((p) => p.code)).toEqual(['crosses_region']);
    expect(problems[0]?.message).toContain('both');
  });

  it('rejects a path of a loop that leads out along When done', () => {
    const problems = problemsOf([
      start('l'),
      loop('l', 'flow.for_each', 'a', 'z'),
      step('a', 'z'),
      step('z'),
    ]);
    expect(problems.map((p) => p.code)).toEqual(['crosses_region']);
    expect(problems[0]?.message).toContain('leads out');
  });

  it('reports a node reached twice by branches that do not meet at it, never emitting it twice', () => {
    const problems = problemsOf([
      start('a'),
      ifNode('a', [{ name: 'yes', to: 'x' }], 'b'),
      ifNode('b', [{ name: 'yes', to: 'x' }], 'y'),
      step('x', 'y'),
      step('y'),
    ]);
    expect(problems.map((p) => p.code)).toEqual(['shared_branch_node']);
    expect(problems[0]?.key).toBe('x');
  });

  it('reports a circle of wires', () => {
    const problems = problemsOf([start('a'), step('a', 'b'), step('b', 'a')]);
    expect(problems.map((p) => p.code)).toEqual(['wire_cycle']);
    expect(problems[0]?.message).toContain('These wires go round in a circle');
  });

  it('reports a node nothing leads to', () => {
    const problems = problemsOf([start('a'), step('a'), step('lonely')]);
    expect(problems.map((p) => [p.code, p.key])).toEqual([['never_runs', 'lonely']]);
  });

  it('reports a wire to a step that does not exist', () => {
    const problems = problemsOf([start('a'), step('a', 'wait_9')]);
    expect(problems.map((p) => [p.code, p.port])).toEqual([['unknown_target', 'next']]);
    expect(problems[0]?.wire).toEqual({ from: 'a', port: 'next' });
  });

  it('keeps a wait with a timeout and its Timed out lane', () => {
    const wait = graphNode('w', 'flow.wait_event', {
      ports: { timeout: { lit: 1000 } },
      to: { next: 'after', timedOut: 'late' },
    });
    const body = bodyOf([start('w'), wait, step('late'), step('after')]);
    expect(body.nodes[0]).toMatchObject({ key: 'w', scopes: { timedOut: scope(plain('late')) } });
    expect(body.nodes[1]).toEqual(plain('after'));
  });
});
