import { describe, expect, it } from 'vitest';
import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { layoutGraph } from '@smarteverything/flow/graph/layout';
import { layoutFault } from '@smarteverything/flow/graph/layout-fit';
import { nodeSize } from '@smarteverything/flow/graph/metrics';
import { babyProgram } from './graph-baby-fixture';
import { idOf } from './graph-scene-fixtures';
import { projectGraphScene } from './project-graph-scene';
import type { GraphScene, GraphSceneNode } from './scene-contract';

type Box = Pick<GraphSceneNode, 'x' | 'y' | 'w' | 'h'>;

function overlaps(scene: GraphScene): readonly string[] {
  return scene.nodes.flatMap((one, i) =>
    scene.nodes
      .slice(i + 1)
      .flatMap((two) =>
        one.x < two.x + two.w &&
        two.x < one.x + one.w &&
        one.y < two.y + two.h &&
        two.y < one.y + one.h
          ? [`${one.title} / ${two.title}`]
          : [],
      ),
  );
}

function box(scene: GraphScene, key: string): Box {
  const found = scene.nodes.find((node) => node.id === idOf(key));
  if (found === undefined) throw new Error(`no node ${key}`);
  return found;
}

const sceneOf = (measured?: ReadonlyMap<string, { w: number; h: number }>): GraphScene =>
  projectGraphScene(babyProgram(), {
    direction: 'ltr',
    density: 'pointer',
    kinds: STATIC_KIND_LOOKUP,
    ...(measured === undefined ? {} : { measured }),
  });

describe('Baby crying layout', () => {
  it('has no cards on top of each other', () => {
    expect(overlaps(sceneOf())).toEqual([]);
  });

  it('stays apart when the measured cards are much taller', () => {
    const tall = new Map(sceneOf().nodes.map((node) => [node.id, { w: node.w, h: node.h + 120 }]));
    const scene = sceneOf(tall);
    expect(overlaps(scene)).toEqual([]);
    expect(box(scene, 'lamp').h).toBe(tall.get(idOf('lamp'))?.h);
  });

  it('puts the value cards above the exec line of their consumer', () => {
    const scene = sceneOf();
    for (const [value, consumer] of [
      ['dark', 'night'],
      ['level', 'lamp'],
      ['enabled', 'start'],
    ] as const) {
      const v = box(scene, value);
      const c = box(scene, consumer);
      expect(v.y + v.h).toBeLessThanOrEqual(c.y);
      expect(v.x + v.w).toBeLessThanOrEqual(c.x);
    }
  });

  it('numbers Wait for all right after the paths it waits for', () => {
    const order = sceneOf().nodes.map((node) => node.id);
    expect(order.indexOf(idOf('meet'))).toBe(order.indexOf(idOf('guarded')) - 1);
  });

  it('draws every node when a wire goes round in a circle', () => {
    const scene = projectGraphScene(babyProgram({ backWire: true }), {
      direction: 'ltr',
      kinds: STATIC_KIND_LOOKUP,
    });
    expect(scene.unplaced).toEqual([]);
    expect(scene.nodes).toHaveLength(babyProgram().nodes.length + 1);
    expect(scene.edges.filter((edge) => edge.state === 'problem')).toHaveLength(1);
    expect(overlaps(scene)).toEqual([]);
  });

  it('shows a stored layout made with the old card sizes as the structured layout', () => {
    const program = babyProgram();
    const old = new Map(
      program.nodes.map((node) => [node.id, nodeSize(node, 'pointer', STATIC_KIND_LOOKUP)]),
    );
    const nodes = layoutGraph(program, {
      kinds: STATIC_KIND_LOOKUP,
      direction: 'ltr',
      density: 'pointer',
      sizes: old,
    }).nodes;
    const stored = { nodes, frames: [], comments: [] };
    const options = { direction: 'ltr', density: 'pointer', kinds: STATIC_KIND_LOOKUP } as const;
    expect(layoutFault(program, stored, options)).toBe('overlap');
    const scene = projectGraphScene(program, { ...options, layout: stored });
    expect(overlaps(scene)).toEqual([]);
    expect(scene.unplaced).toEqual([]);
  });

  it('keeps a stored layout that fits the measured cards', () => {
    const tidy = sceneOf();
    const nodes = Object.fromEntries(
      tidy.nodes.map((node) => [node.id, { x: node.x + 400, y: node.y + 40 }]),
    );
    const scene = projectGraphScene(babyProgram(), {
      direction: 'ltr',
      density: 'pointer',
      kinds: STATIC_KIND_LOOKUP,
      layout: { nodes, frames: [], comments: [] },
    });
    expect(box(scene, 'lamp').x).toBe(box(tidy, 'lamp').x + 400);
  });
});
