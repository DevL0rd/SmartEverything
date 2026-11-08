import {
  NODE_REGISTRY,
  STATIC_KIND_LOOKUP,
  type NodeKind,
  type NodeKindLookup,
  type ProgramV4,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { layoutGraph } from '../../src/graph/layout';
import { cardClassOf } from '../../src/graph/metrics';
import { execGraphOf } from '../../src/graph/regions';
import { structuredOf } from '../../src/graph/structured-of';
import { unstructure } from '../../src/graph/unstructure';
import { automation, graphNode, start, step } from './graph-fixtures';

const START_KIND = 'plugin.treadmill.start';

function startKind(): NodeKind {
  const base = NODE_REGISTRY.get('device.set');
  if (base === undefined) throw new Error('device.set is a core kind');
  return {
    ...base,
    id: START_KIND,
    name: 'Start the treadmill',
    inputs: [
      { name: 'treadmill', type: { t: 'text' }, required: true, description: 'Which one.' },
      { name: 'speed', type: { t: 'number' }, required: false, description: 'How fast.' },
    ],
    outputs: [],
    origin: { kind: 'plugin', id: 'treadmill', name: 'Treadmill', icon: 'plug', version: '1.0.0' },
  };
}

function liveKinds(): NodeKindLookup {
  const plugin = startKind();
  return {
    get: (id) => (id === START_KIND ? plugin : NODE_REGISTRY.get(id)),
    has: (id) => id === START_KIND || NODE_REGISTRY.has(id),
  };
}

function program(): ProgramV4 {
  return automation([
    start('walk'),
    graphNode('walk', START_KIND, { to: { next: 'after' } }),
    step('after'),
  ]);
}

describe('a plugin action node read through the live kind lookup', () => {
  it('is an exec step of the graph with its next wire', () => {
    const graph = execGraphOf(program(), liveKinds());
    expect(graph.exec.map((node) => node.key)).toContain('walk');
    expect(graph.outputs.get('walk')?.map((out) => out.port)).toContain('next');
  });

  it('keeps its place in the structure and survives the round trip', () => {
    const kinds = liveKinds();
    const structured = structuredOf(program(), kinds);
    expect(structured.kind).toBe('structured');
    if (structured.kind !== 'structured') return;
    expect(structured.tree.body.nodes.map((node) => node.key)).toEqual(['walk', 'after']);
    const back = unstructure(structured.tree, kinds);
    expect(back.nodes.find((node) => node.key === 'walk')?.to).toEqual({ next: 'after' });
  });

  it('is laid out as a step card, not a value card', () => {
    const kinds = liveKinds();
    expect(cardClassOf(START_KIND, kinds)).toBe('step');
    const placed = layoutGraph(program(), { kinds, direction: 'ltr' });
    expect(placed.problemCount).toBe(0);
  });

  it('reads as a value card with an unknown target under the core lookup alone', () => {
    const structured = structuredOf(program(), STATIC_KIND_LOOKUP);
    expect(structured.kind).toBe('unstructured');
    if (structured.kind !== 'unstructured') return;
    expect(structured.problems.map((found) => found.code)).toContain('unknown_target');
  });
});
