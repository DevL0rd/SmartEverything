import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import type { Layout, ProgramV4 } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { layoutGraph, type GraphLayoutResult, type Rect } from '../../src/graph/layout';
import { END_CAP_W, GAP, programSizes } from '../../src/graph/metrics';
import { completeLayout, placeNew } from '../../src/graph/place-new';
import {
  automation,
  idOf,
  ifNode,
  join,
  loop,
  start,
  step,
  stop,
  together,
  tryNode,
  value,
} from './graph-fixtures';

function rect(result: GraphLayoutResult, key: string): Rect {
  const found = result.rects.get(idOf(key));
  if (found === undefined) throw new Error(`no rectangle for ${key}`);
  return found;
}

function right(box: Rect): number {
  return box.x + box.w;
}

function bottom(box: Rect): number {
  return box.y + box.h;
}

function overlapping(result: GraphLayoutResult): readonly string[] {
  const boxes = [...result.rects];
  return boxes.flatMap(([a, one], i) =>
    boxes
      .slice(i + 1)
      .flatMap(([b, two]) =>
        one.x < right(two) && two.x < right(one) && one.y < bottom(two) && two.y < bottom(one)
          ? [`${a} ${b}`]
          : [],
      ),
  );
}

const branching = (): ProgramV4 =>
  automation([
    start('decide'),
    ifNode(
      'decide',
      [
        { name: 'a', to: 'x' },
        { name: 'b', to: 'y' },
      ],
      'z',
    ),
    step('x', 'm'),
    step('y', 'm'),
    step('z', 'm'),
    step('m'),
  ]);

function withTriggers(base: ProgramV4, keys: readonly string[]): ProgramV4 {
  if (base.kind !== 'automation') throw new Error('expected an automation');
  const triggers = keys.map((key) => ({ id: idOf(key), key, kind: 'trigger.signal', ports: {} }));
  return { ...base, triggers };
}

const touched = (program: ProgramV4, direction: 'ltr' | 'ttb'): GraphLayoutResult =>
  layoutGraph(program, { kinds: STATIC_KIND_LOOKUP, direction });

describe('layoutGraph sequence', () => {
  const program = automation([start('a'), step('a', 'b'), step('b', 'c'), stop('c')]);

  it('flows left to right with a 52 px gap', () => {
    const result = touched(program, 'ltr');
    expect(rect(result, 'a').x).toBe(right(rect(result, 'start')) + GAP.sequence);
    expect(rect(result, 'b').x).toBe(right(rect(result, 'a')) + GAP.sequence);
    expect(rect(result, 'c').x).toBe(right(rect(result, 'b')) + GAP.sequence);
    expect(rect(result, 'b').y).toBe(rect(result, 'a').y);
    expect(result.remainder).toEqual([]);
    expect(result.problemCount).toBe(0);
  });

  it('flows top to bottom in the other direction', () => {
    const result = touched(program, 'ttb');
    expect(rect(result, 'a').y).toBe(bottom(rect(result, 'start')) + GAP.sequence);
    expect(rect(result, 'b').y).toBe(bottom(rect(result, 'a')) + GAP.sequence);
    expect(rect(result, 'b').x).toBe(rect(result, 'a').x);
  });

  it('gives the same answer for the same input', () => {
    expect(layoutGraph(program, { kinds: STATIC_KIND_LOOKUP, direction: 'ltr' })).toEqual(
      layoutGraph(structuredClone(program), { kinds: STATIC_KIND_LOOKUP, direction: 'ltr' }),
    );
  });

  it('writes a position for every node', () => {
    const result = touched(program, 'ltr');
    expect(Object.keys(result.nodes).sort()).toEqual(program.nodes.map((node) => node.id).sort());
  });
});

describe('layoutGraph decisions', () => {
  it('stacks the branches with 32 px between them and puts the merge right of the widest', () => {
    const result = touched(branching(), 'ltr');
    const [x, y, z] = ['x', 'y', 'z'].map((key) => rect(result, key));
    if (x === undefined || y === undefined || z === undefined) throw new Error('missing');
    expect(x.x).toBe(right(rect(result, 'decide')) + GAP.sequence);
    expect(y.y).toBe(bottom(x) + GAP.branch);
    expect(z.y).toBe(bottom(y) + GAP.branch);
    expect(rect(result, 'm').x).toBe(Math.max(right(x), right(y), right(z)) + GAP.sequence);
    expect(rect(result, 'm').y).toBe(rect(result, 'decide').y);
  });

  it('stacks the branches side by side top to bottom flow', () => {
    const result = touched(branching(), 'ttb');
    expect(rect(result, 'y').x).toBe(right(rect(result, 'x')) + GAP.branch);
    expect(rect(result, 'm').y).toBeGreaterThan(bottom(rect(result, 'x')));
  });

  it('has no overlaps in either direction', () => {
    expect(overlapping(touched(branching(), 'ltr'))).toEqual([]);
    expect(overlapping(touched(branching(), 'ttb'))).toEqual([]);
  });
});

describe('layoutGraph owners', () => {
  const program = automation([
    start('each'),
    loop('each', 'flow.for_each', 'inside', 'after'),
    step('inside', 'inside2'),
    step('inside2'),
    step('after'),
  ]);

  it('puts the body right of its owner on its port row and continues after the end-cap room', () => {
    const result = touched(program, 'ltr');
    const owner = rect(result, 'each');
    expect(rect(result, 'inside').x).toBe(right(owner) + GAP.sequence);
    expect(rect(result, 'inside').y).toBeGreaterThan(owner.y);
    expect(rect(result, 'inside').y).toBeLessThan(bottom(owner));
    const laneEnd = right(rect(result, 'inside2'));
    expect(rect(result, 'after').x).toBe(laneEnd + END_CAP_W + GAP.sequence);
    expect(rect(result, 'after').y).toBe(owner.y);
    expect(overlapping(result)).toEqual([]);
  });

  it('puts the body below its owner in the other direction', () => {
    const result = touched(program, 'ttb');
    const owner = rect(result, 'each');
    expect(rect(result, 'inside').y).toBe(bottom(owner) + GAP.sequence);
    expect(overlapping(result)).toEqual([]);
  });

  it('lays out a Try with its catch and finally lanes', () => {
    const tried = automation([
      start('t'),
      tryNode('t', {
        attempt: 'a',
        catches: [{ name: 'c', to: 'b' }],
        finally: 'f',
        next: 'n',
      }),
      step('a'),
      step('b'),
      step('f'),
      step('n'),
    ]);
    const result = touched(tried, 'ltr');
    expect(rect(result, 'b').y).toBeGreaterThan(rect(result, 'a').y);
    expect(rect(result, 'f').y).toBeGreaterThan(rect(result, 'b').y);
    expect(overlapping(result)).toEqual([]);
    expect(result.remainder).toEqual([]);
  });
});

describe('layoutGraph Do together', () => {
  const program = automation([
    start('both'),
    together('both', [
      { name: 'one', to: 'x' },
      { name: 'two', to: 'y' },
    ]),
    step('x', 'sync'),
    step('y', 'y2'),
    step('y2', 'sync'),
    join('sync', 'done'),
    step('done'),
  ]);

  it('stacks the paths and puts Wait for all right of the widest path', () => {
    const result = touched(program, 'ltr');
    expect(rect(result, 'y').y).toBe(bottom(rect(result, 'x')) + GAP.branch);
    const widest = Math.max(right(rect(result, 'x')), right(rect(result, 'y2')));
    expect(rect(result, 'sync').x).toBe(widest + GAP.sequence);
    expect(rect(result, 'sync').y).toBe(rect(result, 'both').y);
    expect(rect(result, 'done').x).toBe(right(rect(result, 'sync')) + GAP.sequence);
    expect(overlapping(result)).toEqual([]);
    expect(result.remainder).toEqual([]);
  });

  it('works top to bottom as well', () => {
    const result = touched(program, 'ttb');
    expect(rect(result, 'sync').y).toBeGreaterThan(bottom(rect(result, 'y2')));
    expect(overlapping(result)).toEqual([]);
  });
});

describe('layoutGraph values and triggers', () => {
  const program = withTriggers(
    automation([
      start('a'),
      step('a', undefined, { ports: { to: { wire: { from: 'v', port: 'value' } } } }),
      value('v'),
    ]),
    ['t1', 't2'],
  );

  it('puts a value card above and left of its consumer, off the exec line', () => {
    const result = touched(program, 'ltr');
    expect(right(rect(result, 'v')) + GAP.value).toBe(rect(result, 'a').x);
    expect(bottom(rect(result, 'v')) + GAP.valueAbove).toBe(rect(result, 'a').y);
    expect(rect(result, 'start').y).toBe(rect(result, 'a').y);
    const above = touched(program, 'ttb');
    expect(bottom(rect(above, 'v')) + GAP.value).toBe(rect(above, 'a').y);
    expect(right(rect(above, 'v')) + GAP.valueAbove).toBe(rect(above, 'a').x);
  });

  it('stacks the triggers left of Start', () => {
    const result = touched(program, 'ltr');
    const first = rect(result, 't1');
    expect(right(first) + GAP.sequence).toBe(rect(result, 'start').x);
    expect(rect(result, 't2').y).toBe(bottom(first) + GAP.trigger);
    expect(overlapping(result)).toEqual([]);
    expect(result.remainder).toEqual([]);
  });
});

describe('layoutGraph tidy refusal', () => {
  it('lays out what structures and returns the rest with the problem count', () => {
    const program = automation([start('a'), step('a'), step('lonely'), step('lonely2', 'lonely')]);
    const result = touched(program, 'ltr');
    expect(result.problemCount).toBe(2);
    expect([...result.remainder].sort()).toEqual([idOf('lonely'), idOf('lonely2')].sort());
    expect(result.rects.has(idOf('a'))).toBe(true);
    expect(result.rects.has(idOf('start'))).toBe(true);
  });

  it('cuts a wire to a missing step and still lays out the node', () => {
    const result = touched(automation([start('a'), step('a', 'ghost')]), 'ltr');
    expect(result.problemCount).toBe(1);
    expect(result.remainder).toEqual([]);
    expect(result.rects.has(idOf('a'))).toBe(true);
  });
});

const empty: Layout = { nodes: {}, frames: [], comments: [] };

describe('completeLayout from nothing', () => {
  it('uses the structured layout when no position is stored yet', () => {
    const program = branching();
    const done = completeLayout(program, empty, { kinds: STATIC_KIND_LOOKUP, direction: 'ltr' });
    expect(done.nodes).toEqual(
      layoutGraph(program, { kinds: STATIC_KIND_LOOKUP, direction: 'ltr' }).nodes,
    );
  });
});

describe('placeNew', () => {
  const program = automation([start('a'), step('a', 'n'), step('n')]);
  const sizes = programSizes(program, 'touch', STATIC_KIND_LOOKUP);
  const base: Layout = { ...empty, nodes: { [idOf('a')]: { x: 100, y: 50 } } };

  it('puts an exec node right of its predecessor', () => {
    const at = placeNew(program, base, 'n', { kinds: STATIC_KIND_LOOKUP, direction: 'ltr' });
    const a = sizes.get(idOf('a'));
    expect(at).toEqual({ x: 100 + (a?.w ?? 0) + GAP.sequence, y: 50 });
  });

  it('puts it below the previous card in the other direction', () => {
    const at = placeNew(program, base, 'n', { kinds: STATIC_KIND_LOOKUP, direction: 'ttb' });
    const a = sizes.get(idOf('a'));
    expect(at).toEqual({ x: 100, y: 50 + (a?.h ?? 0) + GAP.sequence });
  });

  it('stacks the later outputs of a decision below the first', () => {
    const decided = automation([
      start('d'),
      ifNode('d', [{ name: 'p', to: 'one' }], 'two'),
      step('one'),
      step('two'),
    ]);
    const layout: Layout = {
      ...empty,
      nodes: { [idOf('d')]: { x: 0, y: 0 }, [idOf('one')]: { x: 332, y: 0 } },
    };
    const at = placeNew(decided, layout, 'two', { kinds: STATIC_KIND_LOOKUP, direction: 'ltr' });
    expect(at.x).toBe(332);
    expect(at.y).toBeGreaterThanOrEqual(
      (programSizes(decided, 'touch', STATIC_KIND_LOOKUP).get(idOf('one'))?.h ?? 0) + GAP.branch,
    );
  });

  it('puts a value left of its first consumer', () => {
    const valued = automation([
      start('a'),
      step('a', undefined, { ports: { to: { wire: { from: 'v', port: 'value' } } } }),
      value('v'),
    ]);
    const at = placeNew(valued, base, 'v', { kinds: STATIC_KIND_LOOKUP, direction: 'ltr' });
    const height = programSizes(valued, 'touch', STATIC_KIND_LOOKUP).get(idOf('v'))?.h ?? 0;
    expect(at).toEqual({ x: 100 - GAP.value - 212, y: 50 - GAP.valueAbove - height });
  });

  it('moves a node that would land on another card', () => {
    const first = placeNew(program, base, 'n', { kinds: STATIC_KIND_LOOKUP, direction: 'ltr' });
    const crowded: Layout = { ...base, nodes: { ...base.nodes, [idOf('x')]: first } };
    const blocked = automation([start('a'), step('a', 'n'), step('n'), stop('x')]);
    const moved = placeNew(blocked, crowded, 'n', { kinds: STATIC_KIND_LOOKUP, direction: 'ltr' });
    expect(moved.x).toBe(first.x);
    expect(moved.y).toBeGreaterThan(first.y);
  });

  it('puts an unwired node below everything', () => {
    const lonely = automation([start('a'), step('a'), step('free')]);
    const at = placeNew(lonely, base, 'free', { kinds: STATIC_KIND_LOOKUP, direction: 'ltr' });
    expect(at.x).toBe(100);
    expect(at.y).toBeGreaterThan(50);
  });

  it('refuses a key that is not in the program', () => {
    expect(() =>
      placeNew(program, base, 'nope', { kinds: STATIC_KIND_LOOKUP, direction: 'ltr' }),
    ).toThrow('nope');
  });
});

describe('completeLayout', () => {
  it('fills every missing position, predecessors first', () => {
    const program = automation([start('a'), step('c'), step('b', 'c'), step('a', 'b')]);
    const done = completeLayout(program, empty, { kinds: STATIC_KIND_LOOKUP, direction: 'ltr' });
    expect(Object.keys(done.nodes).sort()).toEqual(program.nodes.map((node) => node.id).sort());
    const [a, b, c] = ['a', 'b', 'c'].map((key) => done.nodes[idOf(key)]?.x ?? -1);
    expect(a).toBeLessThan(b ?? 0);
    expect(b).toBeLessThan(c ?? 0);
  });

  it('keeps the positions that exist', () => {
    const program = automation([start('a'), step('a')]);
    const kept: Layout = { ...empty, nodes: { [idOf('a')]: { x: 7, y: 9 } } };
    expect(
      completeLayout(program, kept, { kinds: STATIC_KIND_LOOKUP, direction: 'ltr' }).nodes[
        idOf('a')
      ],
    ).toEqual({ x: 7, y: 9 });
  });

  it('places triggers left of Start', () => {
    const program = withTriggers(automation([start('a'), step('a')]), ['t']);
    const done = completeLayout(program, empty, { kinds: STATIC_KIND_LOOKUP, direction: 'ltr' });
    const at = done.nodes[idOf('t')];
    const origin = done.nodes[idOf('start')];
    expect(at?.x ?? 0).toBeLessThan(origin?.x ?? 0);
  });
});
