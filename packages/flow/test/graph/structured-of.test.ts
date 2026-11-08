import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { NODE_REGISTRY } from '@smarteverything/domain';
import type { GraphNode, ProgramV4 } from '@smarteverything/domain';
import { lower } from '../../src/compile/lower';
import { lowerGraph, type LowerGraphContext } from '../../src/graph/lower-graph';
import { structuredOf } from '../../src/graph/structured-of';
import { pathKey } from '../../src/graph/structure';
import { context as checkContext } from '../check/c23-support';
import {
  TRUE,
  automation,
  flow,
  graphNode,
  idOf,
  ifNode,
  plain,
  scope,
  start,
  step,
} from './graph-fixtures';

const context: LowerGraphContext = {
  check: checkContext(),
  lower: { kinds: (id) => NODE_REGISTRY.get(id) },
};

const set = (key: string, next?: string): GraphNode =>
  graphNode(key, 'notify.feed', {
    ports: { message: { lit: 'hello' } },
    ...(next === undefined ? {} : { to: { next } }),
  });

function valid(): ProgramV4 {
  return automation([
    start('decide'),
    ifNode('decide', [{ name: 'yes', to: 'x' }], 'm'),
    set('x', 'm'),
    set('m'),
  ]);
}

describe('structuredOf', () => {
  it('returns the tree and the map for a valid graph', () => {
    const result = structuredOf(valid(), STATIC_KIND_LOOKUP);
    if (result.kind !== 'structured') throw new Error('expected a tree');
    expect(result.tree.version).toBe(3);
    expect(result.tree.body.nodes.map((node) => node.key)).toEqual(['decide', 'm']);
    expect(result.map.get(pathKey(['body', 'nodes', 1]))).toMatchObject({ key: 'm' });
  });

  it('places the value nodes of the graph in the tree', () => {
    const program = automation([
      start('a'),
      step('a', undefined, { ports: { to: { wire: { from: 'v', port: 'value' } } } }),
      graphNode('v', 'device.get'),
    ]);
    const result = structuredOf(program, STATIC_KIND_LOOKUP);
    if (result.kind !== 'structured') throw new Error('expected a tree');
    expect(result.tree.body).toEqual(
      scope(
        flow('v', 'device.get'),
        plain('a', { ports: { to: { wire: { from: 'v', port: 'value' } } } }),
      ),
    );
  });

  it('reports a draft that does not structure with its problems and no tree', () => {
    const program = automation([start('a'), step('a', 'wait_9')]);
    const result = structuredOf(program, STATIC_KIND_LOOKUP);
    expect(result.kind).toBe('unstructured');
    if (result.kind !== 'unstructured') throw new Error('expected problems');
    expect(result.problems.map((problem) => problem.code)).toEqual(['unknown_target']);
    expect('tree' in result).toBe(false);
  });
});

describe('lowerGraph', () => {
  it('gives the same plan as lowering the structured tree', () => {
    const program = valid();
    const structured = structuredOf(program, STATIC_KIND_LOOKUP);
    if (structured.kind !== 'structured') throw new Error('expected a tree');
    const direct = lower(structured.tree, context.lower);
    const result = lowerGraph(program, context);
    if (!result.ok || !direct.ok) throw new Error('expected a plan');
    expect(result.plan).toEqual(direct.plan);
    expect(result.tree).toEqual(structured.tree);
  });

  it('stops at the structure problems of a draft', () => {
    const result = lowerGraph(automation([start('a'), step('a'), step('lonely')]), context);
    expect(result).toMatchObject({ ok: false, stage: 'structure' });
  });

  it('stops at the checker problems of a graph that structures', () => {
    const program = automation([
      start('a'),
      step('a', undefined, { ports: { to: { wire: { from: 'ghost', port: 'value' } } } }),
    ]);
    const result = lowerGraph(program, context);
    expect(result).toMatchObject({ ok: false, stage: 'check' });
    if (result.ok || result.stage !== 'check') throw new Error('expected check problems');
    expect(result.problems.map((problem) => problem.code)).toContain('unknown_reference');
  });

  it('stops at the graph rules before structuring', () => {
    const program = automation([start('a'), step('a'), step('a')]);
    const result = lowerGraph(program, context);
    expect(result).toMatchObject({ ok: false, stage: 'rules' });
  });
});

describe('ids', () => {
  it('keeps the ids of the graph nodes in the tree', () => {
    const result = structuredOf(valid(), STATIC_KIND_LOOKUP);
    if (result.kind !== 'structured') throw new Error('expected a tree');
    expect(result.tree.body.nodes[0]).toMatchObject({
      id: idOf('decide'),
      branches: [{ id: idOf('decide:yes'), when: TRUE }],
    });
  });
});
