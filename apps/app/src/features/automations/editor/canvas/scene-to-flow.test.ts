import { describe, expect, it } from 'vitest';
import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { decisionProgram, forkProgram, loopProgram } from '../../model/graph/graph-scene-fixtures';
import { projectGraphScene } from '../../model/graph/project-graph-scene';
import type { GraphScene } from '../../model/graph/scene-contract';
import { buildGraphEdges, buildGraphNodes, pairRing, withSelection } from './scene-to-flow';

function sceneOf(program: Parameters<typeof projectGraphScene>[0]): GraphScene {
  return projectGraphScene(program, { direction: 'ltr', kinds: STATIC_KIND_LOOKUP });
}

describe('buildGraphNodes', () => {
  it('maps every scene node to a node typed by its family at its position', () => {
    const scene = sceneOf(decisionProgram());
    const nodes = buildGraphNodes(scene);
    expect(nodes).toHaveLength(scene.nodes.length);
    for (const [index, node] of nodes.entries()) {
      const source = scene.nodes[index];
      expect(node.id).toBe(source?.id);
      expect(node.type).toBe(source?.family);
      expect(node.position).toEqual({ x: source?.x, y: source?.y });
      expect(node.initialWidth).toBe(source?.w);
    }
  });

  it('keeps Start fixed and leaves every other card to the canvas drag setting', () => {
    const nodes = buildGraphNodes(sceneOf(decisionProgram()));
    for (const node of nodes)
      expect(node.draggable).toBe(node.type === 'start' ? false : undefined);
  });

  it('hands the join the label of each path that leads into it', () => {
    const scene = sceneOf(forkProgram('all'));
    const join = scene.nodes.find((node) => node.family === 'join');
    const data = buildGraphNodes(scene).find((node) => node.id === join?.id)?.data;
    expect(data?.incoming).toHaveLength(2);
  });
});

describe('buildGraphEdges', () => {
  it('draws exec wires above value wires and gives each kind its own edge type', () => {
    const scene = sceneOf(loopProgram());
    const edges = buildGraphEdges(scene, []);
    const exec = edges.filter((edge) => edge.className?.includes('gc-edge-exec') === true);
    const value = edges.filter((edge) => edge.className?.includes('gc-edge-value') === true);
    expect(exec.length).toBeGreaterThan(0);
    expect(value.length).toBeGreaterThan(0);
    for (const edge of exec) {
      expect(edge.type).toBe('exec');
      expect(edge.zIndex).toBe(2);
    }
    for (const edge of value) {
      expect(edge.type).toBe('value');
      expect(edge.zIndex).toBe(1);
    }
  });

  it('carries the scene handle ids to React Flow unchanged', () => {
    const scene = sceneOf(loopProgram());
    for (const [index, edge] of buildGraphEdges(scene, []).entries()) {
      expect(edge.sourceHandle).toBe(scene.edges[index]?.source.handle);
      expect(edge.targetHandle).toBe(scene.edges[index]?.target.handle);
    }
  });

  it('marks taken wires and nothing else', () => {
    const scene = sceneOf(decisionProgram());
    const first = scene.edges[0]?.id ?? '';
    const edges = buildGraphEdges(scene, [first]);
    expect(edges.filter((edge) => edge.className?.includes('gc-taken') === true)).toHaveLength(1);
    expect(edges[0]?.className).toContain('gc-taken');
  });
});

describe('pair ring', () => {
  const scene = sceneOf(forkProgram('all'));
  const forkId = scene.nodes.find((node) => node.family === 'fork')?.id ?? '';
  const joinId = scene.nodes.find((node) => node.family === 'join')?.id ?? '';

  it('rings both cards of the pair when one is selected and no others', () => {
    expect([...pairRing(scene, [forkId])].sort()).toEqual([forkId, joinId].sort());
  });

  it('rings nothing for a card without a pair', () => {
    const plain = scene.nodes.find((node) => node.pairIndex === null);
    expect(pairRing(scene, [plain?.id ?? ''])).toEqual(new Set());
  });

  it('marks the ring and the selection on the nodes and reuses untouched ones', () => {
    const base = buildGraphNodes(scene);
    const marked = withSelection(base, scene, [forkId]);
    const byId = new Map(marked.map((node) => [node.id, node]));
    expect(byId.get(forkId)?.selected).toBe(true);
    expect(byId.get(joinId)?.className).toBe('gc-ringed');
    const other = base.find((node) => node.id !== forkId && node.id !== joinId);
    expect(byId.get(other?.id ?? '')).toBe(other);
    expect(withSelection(marked, scene, [forkId])).toEqual(marked);
  });
});
