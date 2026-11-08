import { Position } from '@xyflow/react';
import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  automation,
  forkProgram,
  gnode,
  note,
  start,
  wire,
} from '../../../model/graph/graph-scene-fixtures';
import { projectGraphScene } from '../../../model/graph/project-graph-scene';
import type { GraphScene, GraphSceneEdge } from '../../../model/graph/scene-contract';
import { cardHtml, renderScene } from '../render-support';
import { buildGraphEdges } from '../scene-to-flow';
import { GRAPH_EDGE_TYPES } from './edge-types';
import { renderWire } from './edge-support';
import { STRAIGHT_BELOW, execPath } from './exec-edge';
import { VALUE_LEAD, valuePath } from './value-edge';

function valueScene(): GraphScene {
  return projectGraphScene(
    automation([
      start('show'),
      gnode('sensor', 'device.get', { ports: { device: { lit: 'hall' } } }),
      note('show', undefined, { ports: { message: wire('sensor', 'value') } }),
    ]),
    { direction: 'ltr', kinds: STATIC_KIND_LOOKUP },
  );
}

function edgeOf(scene: GraphScene, kind: GraphSceneEdge['kind']): GraphSceneEdge {
  const found = scene.edges.find((edge) => edge.kind === kind && !edge.fixed);
  if (found === undefined) throw new Error(`no ${kind} edge`);
  return found;
}

describe('exec wire geometry', () => {
  const flat = {
    sourceX: 0,
    sourceY: 10,
    targetX: 200,
    targetY: 11,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  };

  it('draws a straight line when the ends are within a pixel or two of level', () => {
    const wire = execPath(flat);
    expect(wire.path).toBe('M 0,10 L 200,11');
    expect(wire.labelX).toBe(100);
    expect(wire.labelY).toBe(10.5);
  });

  it('smooth-steps with rounded corners once the ends differ by the step threshold', () => {
    const wire = execPath({ ...flat, targetY: 10 + STRAIGHT_BELOW });
    expect(wire.path).toContain('Q');
  });

  it('keeps a backward wire on the smooth step', () => {
    expect(execPath({ ...flat, targetX: -50, targetY: 100 }).path).toContain('Q');
  });
});

describe('graph edge components', () => {
  it('maps every scene edge kind to a registered edge type', () => {
    const scene = valueScene();
    for (const edge of buildGraphEdges(scene, [])) {
      expect(Object.keys(GRAPH_EDGE_TYPES)).toContain(edge.type);
    }
  });

  it('renders an exec wire as a path of its own kind', () => {
    const scene = projectGraphScene(forkProgram('all'), {
      direction: 'ltr',
      kinds: STATIC_KIND_LOOKUP,
    });
    const html = renderWire(scene, edgeOf(scene, 'exec'), 0);
    expect(html).toContain('data-kind="exec"');
    expect(html).toContain('react-flow__edge-path');
    expect(html).toContain('d="M 100,50 L 300,50"');
  });

  it('renders a value wire in the colour of the pin type', () => {
    const scene = valueScene();
    const html = renderWire(scene, edgeOf(scene, 'value'), 40);
    expect(html).toContain('data-kind="value"');
    expect(html).toMatch(/style="stroke:var\(--se-type-[a-z]+, var\(--se-outline\)\)"/);
  });

  it('leaves a problem value wire to the problem colour', () => {
    const scene = valueScene();
    const edge = { ...edgeOf(scene, 'value'), state: 'problem' as const };
    const html = renderWire(scene, edge, 40);
    expect(html).not.toContain('--se-type-');
  });

  it('marks taken wires and keeps them exec-typed for the flowing glow', () => {
    const scene = projectGraphScene(forkProgram('all'), {
      direction: 'ltr',
      kinds: STATIC_KIND_LOOKUP,
    });
    const taken = edgeOf(scene, 'exec').id;
    const edge = buildGraphEdges(scene, [taken]).find((candidate) => candidate.id === taken);
    expect(edge?.type).toBe('exec');
    expect(edge?.className).toContain('gc-taken');
    const others = buildGraphEdges(scene, [taken]).filter((candidate) => candidate.id !== taken);
    expect(others.every((candidate) => candidate.className?.includes('gc-taken') === false)).toBe(
      true,
    );
  });

  it('shows the merge count where more than one wire arrives', () => {
    const scene = projectGraphScene(forkProgram('all'), {
      direction: 'ltr',
      kinds: STATIC_KIND_LOOKUP,
    });
    const merged = scene.nodes.find((node) => node.mergeCount !== null);
    expect(merged?.mergeCount).toBe(2);
    const card = cardHtml(renderScene(scene), merged?.id ?? '');
    expect(card).toContain('gc-merge');
  });
});

describe('value wire path', () => {
  it('enters its pin level from the left so it never runs down over the pins above', () => {
    const path = valuePath({ sourceX: 575, sourceY: 207, targetX: 609, targetY: 441 });
    expect(path).toBe(
      `M 575,207 C ${String(575 + VALUE_LEAD)},207 ${String(609 - VALUE_LEAD)},441 609,441`,
    );
  });
});
