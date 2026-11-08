import { describe, expect, it } from 'vitest';
import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import type { ProgramV4 } from '@smarteverything/domain';
import { babyProgram } from '../../../model/graph/graph-baby-fixture';
import {
  decisionProgram,
  forkProgram,
  laneRowsProgram,
  loopProgram,
  switchProgram,
  tryProgram,
} from '../../../model/graph/graph-scene-fixtures';
import { projectGraphScene } from '../../../model/graph/project-graph-scene';
import type {
  GraphScene,
  GraphSceneEdge,
  GraphSceneNode,
} from '../../../model/graph/scene-contract';
import { plainLegs, WIRE_CLEAR, wireCrossings, wireHits, wireOverlaps } from './exec-route';
import { execEnds, execWireRoutes } from './exec-wires';
import { spreadLanes, type LaneWire } from './wire-lanes';

function wireProblems(scene: GraphScene, edge: GraphSceneEdge): readonly string[] {
  const source = scene.nodes.find((node) => node.id === edge.source.nodeId);
  const target = scene.nodes.find((node) => node.id === edge.target.nodeId);
  const ends = execEnds(scene, edge);
  const route = execWireRoutes(scene).get(edge.id);
  if (source === undefined || target === undefined || ends === undefined || route === undefined)
    return [`${edge.id}: missing end`];
  const name = `${source.title} > ${target.title}`;
  if (target.x < source.x + source.w) return [`${name}: goes back`];
  const points = route.points ?? plainLegs(ends);
  return [
    ...(wireHits(points, route.around) ? [`${name}: crosses a card`] : []),
    ...(wireCrossings(points, route.wires) > 0 ? [`${name}: crosses a wire`] : []),
    ...(wireOverlaps(points, route.wires) > 0 ? [`${name}: shares a line`] : []),
  ];
}

function crossings(scene: GraphScene): readonly string[] {
  return scene.edges
    .filter((edge) => edge.kind === 'exec' && edge.state === 'normal')
    .flatMap((edge) => wireProblems(scene, edge));
}

function withoutNotifyParents(): ProgramV4 {
  const program = babyProgram();
  return {
    ...program,
    nodes: program.nodes
      .filter((node) => node.key !== 'parents')
      .map((node) => (node.key === 'night' ? { ...node, to: { else: 'both' } } : node)),
  };
}

const sceneOf = (program: ProgramV4): GraphScene =>
  projectGraphScene(program, { direction: 'ltr', kinds: STATIC_KIND_LOOKUP, density: 'pointer' });

describe('exec wires stay clear of cards', () => {
  it('runs every wire of Baby crying forward without crossing a card, bodies included', () => {
    expect(crossings(sceneOf(babyProgram()))).toEqual([]);
  });

  it('reroutes Otherwise around the lamp instead of across its If wire once Notify parents is gone', () => {
    expect(crossings(sceneOf(withoutNotifyParents()))).toEqual([]);
  });

  it('lands each wire into a join on its own path row', () => {
    const scene = sceneOf(babyProgram());
    const joins = new Set(scene.nodes.filter((node) => node.family === 'join').map((n) => n.id));
    const into = scene.edges.filter(
      (edge) => edge.kind === 'exec' && joins.has(edge.target.nodeId),
    );
    expect(into.length).toBeGreaterThan(1);
    const spots = into.map((edge) => {
      const ends = execEnds(scene, edge);
      return `${edge.target.nodeId}:${String(ends?.targetY)}`;
    });
    expect(new Set(spots).size).toBe(spots.length);
  });

  it('puts the For each and Try bodies right of their container', () => {
    const scene = sceneOf(babyProgram());
    const byTitle = (title: string): GraphSceneNode => {
      const found = scene.nodes.find((node) => node.title === title);
      if (found === undefined) throw new Error(`no card ${title}`);
      return found;
    };
    const each = byTitle('For each light');
    expect(byTitle('Set Light').x).toBeGreaterThanOrEqual(each.x + each.w);
    const guard = byTitle('Try');
    expect(byTitle('Play lullaby').x).toBeGreaterThanOrEqual(guard.x + guard.w);
    expect(byTitle('Tell me it failed').x).toBeGreaterThanOrEqual(guard.x + guard.w);
  });

  it.each([
    ['decision', decisionProgram],
    ['switch', switchProgram],
    ['Do together', (): ProgramV4 => forkProgram('all')],
    ['loop', loopProgram],
    ['Try', tryProgram],
    ['lane rows', laneRowsProgram],
  ] as const)('keeps every %s wire clear of every card', (_name, program) => {
    expect(crossings(sceneOf(program()))).toEqual([]);
  });
});

function upright(points: readonly { x: number; y: number }[]): readonly number[] {
  return points.slice(1).flatMap((point, index) => {
    const from = points[index];
    return from?.x === point.x && from.y !== point.y ? [point.x] : [];
  });
}

describe('exec wires get lanes of their own', () => {
  it('keeps the Otherwise wire out of the span the Level value wire runs through', () => {
    const scene = sceneOf(babyProgram());
    const level = scene.nodes.find((node) => node.title === 'Level');
    const otherwise = scene.edges.find(
      (edge) => edge.source.handle === 'x:else' && edge.kind === 'exec',
    );
    const points = execWireRoutes(scene).get(otherwise?.id ?? '')?.points ?? [];
    const right = (level?.x ?? 0) + (level?.w ?? 0);
    expect(upright(points).length).toBe(1);
    for (const x of upright(points)) expect(x).toBeLessThanOrEqual(right);
  });

  it('splits two wires that would climb into a join on one line', () => {
    const wire = (id: string, from: number, up: number, into: number): LaneWire => ({
      id,
      bundle: id,
      around: [],
      points: [
        { x: 0, y: from },
        { x: 10, y: from },
        { x: 10, y: up },
        { x: 290, y: up },
        { x: 290, y: into },
        { x: 300, y: into },
      ],
    });
    const wires = [wire('lights', 100, 400, 20), wire('notify', 300, 420, 44)];
    const laned = spreadLanes(wires, [{ x: 300, y: 0, w: 200, h: 80 }], []);
    const lights = upright(laned.get('lights') ?? []);
    const notify = upright(laned.get('notify') ?? []);
    expect(Math.abs((lights[1] ?? 0) - (notify[1] ?? 0))).toBeGreaterThanOrEqual(WIRE_CLEAR);
    expect(wireCrossings(laned.get('lights') ?? [], [laned.get('notify') ?? []])).toBe(0);
  });

  it('spaces exits that drop beside each other out of one card', () => {
    const exit = (id: string, from: number, into: number, x: number): LaneWire => ({
      id,
      bundle: id,
      around: [],
      points: [
        { x: 0, y: from },
        { x, y: from },
        { x, y: into },
        { x: 60, y: into },
      ],
    });
    const wires = [exit('fails', 40, 200, 30), exit('then', 80, 300, 24)];
    const laned = spreadLanes(wires, [{ x: 60, y: 180, w: 100, h: 60 }], []);
    const fails = upright(laned.get('fails') ?? [])[0] ?? 0;
    const then = upright(laned.get('then') ?? [])[0] ?? 0;
    expect(fails - then).toBeGreaterThanOrEqual(WIRE_CLEAR);
  });
});
