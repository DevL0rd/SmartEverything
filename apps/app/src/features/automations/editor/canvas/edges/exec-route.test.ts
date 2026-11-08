import type { AutomationV4 } from '@smarteverything/domain';
import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { Position } from '@xyflow/react';
import { EXEC_IN_Y, HEADER_H, ROW_H } from '@smarteverything/flow/graph/metrics';
import { describe, expect, it } from 'vitest';
import { babyProgram } from '../../../model/graph/graph-baby-fixture';
import { idOf } from '../../../model/graph/graph-scene-fixtures';
import { projectGraphScene } from '../../../model/graph/project-graph-scene';
import type { GraphScene, GraphSceneNode } from '../../../model/graph/scene-contract';
import { buildGraphEdges } from '../scene-to-flow';
import { execPath } from './exec-edge';
import { plainLegs, routeAround, wireHits, type WireEnds } from './exec-route';

function afterDelete(): AutomationV4 {
  const program = babyProgram();
  const nodes = program.nodes
    .filter((node) => node.key !== 'parents')
    .map((node) => (node.key === 'night' ? { ...node, to: { ...node.to, else: 'both' } } : node));
  return { ...program, nodes };
}

function nodeOf(scene: GraphScene, key: string): GraphSceneNode {
  const found = scene.nodes.find((node) => node.id === idOf(key));
  if (found === undefined) throw new Error(`no node ${key}`);
  return found;
}

function otherwiseEnds(scene: GraphScene): WireEnds {
  const night = nodeOf(scene, 'night');
  const both = nodeOf(scene, 'both');
  const rows = night.rows.filter((row) => row.role !== 'next');
  const index = rows.findIndex((row) => row.port === 'else');
  const row = ROW_H.touch;
  return {
    sourceX: night.x + night.w,
    sourceY: night.y + HEADER_H + index * row + row / 2,
    targetX: both.x,
    targetY: both.y + EXEC_IN_Y,
  };
}

describe('exec wire routing', () => {
  const ends = { sourceX: 0, sourceY: 100, targetX: 400, targetY: 20 };
  const card = { x: 100, y: 40, w: 200, h: 120 };

  it('keeps the plain wire when nothing is in the way', () => {
    expect(routeAround(ends, [])).toBeUndefined();
    expect(routeAround(ends, [{ x: 100, y: 300, w: 200, h: 50 }])).toBeUndefined();
  });

  it('runs a wire that would cross a card through a free channel beside it', () => {
    expect(wireHits(plainLegs(ends), [card])).toBe(true);
    const route = routeAround(ends, [card]);
    expect(route).toBeDefined();
    expect(wireHits(route?.points ?? [], [card])).toBe(false);
    expect(route?.label.y ?? card.y).toBeLessThan(card.y);
  });

  it('draws the routed wire with rounded corners', () => {
    const wire = execPath(
      { ...ends, sourcePosition: Position.Right, targetPosition: Position.Left },
      [card],
    );
    expect(wire.path.startsWith('M 0,100')).toBe(true);
    expect(wire.path).toContain('Q');
    expect(wire.labelY).toBeLessThan(card.y);
  });
});

describe('the empty Otherwise wire after a delete', () => {
  const scene = projectGraphScene(afterDelete(), { direction: 'ltr', kinds: STATIC_KIND_LOOKUP });
  const edge = buildGraphEdges(scene, []).find(
    (candidate) => candidate.id === `exec:${idOf('night')}.x:else>${idOf('both')}`,
  );
  const lamp = nodeOf(scene, 'lamp');
  const lampBox = { x: lamp.x, y: lamp.y, w: lamp.w, h: lamp.h };

  it('knows the lamp card stands between the If and Do together', () => {
    expect(edge?.data?.around).toContainEqual(lampBox);
    expect(wireHits(plainLegs(otherwiseEnds(scene)), [lampBox])).toBe(true);
  });

  it('goes around the lamp card into Do together', () => {
    const route = routeAround(otherwiseEnds(scene), edge?.data?.around ?? []);
    expect(route).toBeDefined();
    expect(wireHits(route?.points ?? [], scene.nodes)).toBe(false);
  });
});
