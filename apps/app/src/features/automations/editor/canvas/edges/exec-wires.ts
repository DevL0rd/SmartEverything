import {
  EXEC_IN_Y,
  HEADER_H,
  JOIN_PAD,
  JOIN_PIN_PITCH,
  ROW_H,
} from '@smarteverything/flow/graph/metrics';
import type {
  GraphScene,
  GraphSceneEdge,
  GraphSceneNode,
} from '../../../model/graph/scene-contract';
import {
  boxesAround,
  cleaned,
  plainLegs,
  routeAround,
  type WireBox,
  type WireEnds,
  type WirePoints,
} from './exec-route';
import { spreadLanes } from './wire-lanes';

const HEADER_FAMILIES: ReadonlySet<GraphSceneNode['family']> = new Set([
  'step',
  'trigger',
  'start',
  'failure',
  'join',
]);

export interface ExecWireRoute {
  readonly points: WirePoints | null;
  readonly around: readonly WireBox[];
  readonly wires: readonly WirePoints[];
  readonly shift: number;
}

interface Placed {
  readonly edge: GraphSceneEdge;
  readonly ends: WireEnds;
  readonly around: readonly WireBox[];
}

export function pinY(node: GraphSceneNode, handle: string, row: number): number {
  const header = HEADER_FAMILIES.has(node.family);
  const rows = node.rows.filter((candidate) => !(header && candidate.role === 'next'));
  const index = rows.findIndex((candidate) => candidate.handle === handle);
  if (index < 0) return node.y + EXEC_IN_Y;
  return node.y + HEADER_H + index * row + row / 2;
}

function joinSlot(scene: GraphScene, edge: GraphSceneEdge, target: GraphSceneNode): number {
  return scene.edges
    .filter((other) => other.kind === 'exec' && other.target.nodeId === target.id)
    .findIndex((other) => other.id === edge.id);
}

function handleCentre(target: GraphSceneNode): number {
  return target.family === 'join' ? target.h / 2 : EXEC_IN_Y;
}

function inY(scene: GraphScene, edge: GraphSceneEdge, target: GraphSceneNode): number {
  const slot = target.family === 'join' ? joinSlot(scene, edge, target) : -1;
  return slot < 0 ? EXEC_IN_Y : JOIN_PAD + slot * JOIN_PIN_PITCH + JOIN_PIN_PITCH / 2;
}

export function execEnds(scene: GraphScene, edge: GraphSceneEdge): WireEnds | undefined {
  const source = scene.nodes.find((node) => node.id === edge.source.nodeId);
  const target = scene.nodes.find((node) => node.id === edge.target.nodeId);
  if (source === undefined || target === undefined) return undefined;
  return {
    sourceX: source.x + source.w,
    sourceY: pinY(source, edge.source.handle, ROW_H[scene.density]),
    targetX: target.x,
    targetY: target.y + inY(scene, edge, target),
  };
}

function shiftOf(scene: GraphScene, edge: GraphSceneEdge): number {
  const target = scene.nodes.find((node) => node.id === edge.target.nodeId);
  return target === undefined ? 0 : inY(scene, edge, target) - handleCentre(target);
}

function sameTarget(a: GraphSceneEdge, b: GraphSceneEdge, scene: GraphScene): boolean {
  if (a.target.nodeId !== b.target.nodeId || a.target.handle !== b.target.handle) return false;
  const target = scene.nodes.find((node) => node.id === a.target.nodeId);
  return target?.family !== 'join';
}

function othersOf(
  scene: GraphScene,
  placed: readonly Placed[],
  wire: Placed,
  routes: ReadonlyMap<string, WirePoints>,
): readonly WirePoints[] {
  return placed
    .filter((other) => other !== wire && !sameTarget(other.edge, wire.edge, scene))
    .flatMap((other) => {
      const points = routes.get(other.edge.id);
      return points === undefined ? [] : [points];
    });
}

function pointsOf(wire: Placed, wires: readonly WirePoints[]): WirePoints {
  return cleaned(routeAround(wire.ends, wire.around, wires)?.points ?? plainLegs(wire.ends));
}

function bundleOf(scene: GraphScene, edge: GraphSceneEdge): string {
  const target = scene.nodes.find((node) => node.id === edge.target.nodeId);
  return target === undefined || target.family === 'join'
    ? edge.id
    : `${edge.target.nodeId}:${edge.target.handle}`;
}

function boxOf(node: GraphSceneNode): WireBox {
  return { x: node.x, y: node.y, w: node.w, h: node.h };
}

function valueSpans(scene: GraphScene): readonly WireBox[] {
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));
  return scene.edges.flatMap((edge) => {
    const source = byId.get(edge.source.nodeId);
    const target = byId.get(edge.target.nodeId);
    if (edge.kind !== 'value' || source === undefined || target === undefined) return [];
    const from = Math.min(source.x + source.w, target.x);
    const to = Math.max(source.x + source.w, target.x);
    const top = Math.min(source.y, target.y);
    const bottom = Math.max(source.y + source.h, target.y + target.h);
    return [{ x: from, y: top, w: to - from, h: bottom - top }];
  });
}

function laneRoutes(
  scene: GraphScene,
  placed: readonly Placed[],
  routes: ReadonlyMap<string, WirePoints>,
): ReadonlyMap<string, WirePoints> {
  const wires = placed.map((wire) => ({
    id: wire.edge.id,
    points: routes.get(wire.edge.id) ?? plainLegs(wire.ends),
    around: wire.around,
    bundle: bundleOf(scene, wire.edge),
  }));
  return spreadLanes(wires, scene.nodes.map(boxOf), valueSpans(scene));
}

export function execWireRoutes(scene: GraphScene): ReadonlyMap<string, ExecWireRoute> {
  const placed = scene.edges.flatMap((edge): Placed[] => {
    if (edge.kind !== 'exec') return [];
    const ends = execEnds(scene, edge);
    if (ends === undefined) return [];
    return [
      { edge, ends, around: boxesAround(scene.nodes, edge.source.nodeId, edge.target.nodeId) },
    ];
  });
  const routes = new Map(placed.map((wire) => [wire.edge.id, pointsOf(wire, [])]));
  for (const wire of placed)
    routes.set(wire.edge.id, pointsOf(wire, othersOf(scene, placed, wire, routes)));
  const laned = laneRoutes(scene, placed, routes);
  return new Map(
    placed.map((wire) => [
      wire.edge.id,
      {
        points: laned.get(wire.edge.id) ?? plainLegs(wire.ends),
        around: wire.around,
        wires: othersOf(scene, placed, wire, laned),
        shift: shiftOf(scene, wire.edge),
      },
    ]),
  );
}
