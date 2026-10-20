import { describe, expect, it } from 'vitest';
import { NODE_REGISTRY, EMPTY_LAYOUT } from '@smarteverything/domain';
import {
  Ids,
  add,
  automation,
  ifNode,
  note,
  scope,
  setLight,
} from '../../model/canvas/canvas-fixtures';
import type { Scene } from '../../model/canvas/contract';
import { projectScene } from '../../model/canvas/project-scene';
import { neighbourOf } from './key-navigation';
import { buildFlow, portKey } from './scene-flow';

function scene(): Scene {
  const ids = new Ids(1);
  const program = automation([setLight(ids, null), add(ids, null), note(ids, 'hello')]);
  return projectScene(program, { registry: NODE_REGISTRY, layout: EMPTY_LAYOUT, mode: 'wide' });
}

describe('scene to flow', () => {
  it('maps every node and edge with names and absolute positions', () => {
    const source = scene();
    const flow = buildFlow(source, []);
    expect(flow.nodes).toHaveLength(source.nodes.length);
    expect(flow.edges).toHaveLength(source.edges.length);
    for (const node of flow.nodes) {
      expect(node.ariaRole).toBe('group');
      expect(node.ariaLabel).toBe(node.data.scene.ariaLabel);
      expect(node.parentId).toBeUndefined();
    }
  });

  it('lets only exec edges reach the exec handles', () => {
    const flow = buildFlow(scene(), []);
    for (const edge of flow.edges) {
      if (edge.data?.scene.kind === 'exec') {
        expect(edge.targetHandle).toBe('in');
        expect(['next', 'start']).toContain(edge.sourceHandle);
      } else if (edge.data !== undefined) {
        const from = flow.valuePorts.get(portKey(edge.source, edge.sourceHandle ?? ''));
        const to = flow.valuePorts.get(portKey(edge.target, edge.targetHandle ?? ''));
        expect([from, to]).toEqual(['out', 'in']);
      }
    }
  });

  it('marks the selection', () => {
    const source = scene();
    const first = source.nodes[0];
    expect(first).toBeDefined();
    const flow = buildFlow(source, first === undefined ? [] : [first.id]);
    expect(flow.nodes.filter((node) => node.selected === true)).toHaveLength(1);
  });

  it('walks exec order with the arrow keys', () => {
    const source = scene();
    const edge = source.edges.find((candidate) => candidate.kind === 'exec');
    expect(edge).toBeDefined();
    if (edge === undefined) return;
    expect(neighbourOf(source, edge.from.nodeId, 'down')).toBe(edge.to.nodeId);
    expect(neighbourOf(source, edge.to.nodeId, 'up')).toBe(edge.from.nodeId);
    expect(neighbourOf(source, 'missing', 'up')).toBeNull();
  });

  it('builds a flow for a block with lanes', () => {
    const ids = new Ids(1);
    const program = automation([
      ifNode(ids, [scope([setLight(ids, null)])], scope([note(ids, 'x')])),
    ]);
    const source = projectScene(program, {
      registry: NODE_REGISTRY,
      layout: EMPTY_LAYOUT,
      mode: 'wide',
    });
    expect(buildFlow(source, []).nodes.some((node) => node.type === 'lane')).toBe(true);
  });
});
