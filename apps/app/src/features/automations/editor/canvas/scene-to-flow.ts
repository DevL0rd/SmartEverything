import type { GraphScene, GraphSceneEdge, GraphSceneNode } from '../../model/graph/scene-contract';
import { execWireRoutes, type ExecWireRoute } from './edges/exec-wires';
import type { GraphFlowEdge, GraphFlowNode } from './graph-canvas-types';

const FIXED_FAMILIES: ReadonlySet<GraphSceneNode['family']> = new Set(['start']);

const NO_ROUTE: ExecWireRoute = { points: null, around: [], wires: [], shift: 0 };

const EXEC_LAYER = 2;
const VALUE_LAYER = 1;

export interface GraphFlow {
  readonly nodes: GraphFlowNode[];
  readonly edges: GraphFlowEdge[];
}

function sourceLabel(edge: GraphSceneEdge, nodes: ReadonlyMap<string, GraphSceneNode>): string {
  if (edge.lane !== null) return edge.lane;
  const source = nodes.get(edge.source.nodeId);
  if (source === undefined) return edge.source.nodeId;
  const row = source.rows.find((candidate) => candidate.handle === edge.source.handle);
  return source.rows.length > 1 && row !== undefined ? row.label : source.title;
}

function incomingOf(
  scene: GraphScene,
  nodes: ReadonlyMap<string, GraphSceneNode>,
): ReadonlyMap<string, readonly string[]> {
  const incoming = new Map<string, string[]>();
  for (const edge of scene.edges) {
    if (edge.kind !== 'exec') continue;
    const held = incoming.get(edge.target.nodeId) ?? [];
    held.push(sourceLabel(edge, nodes));
    incoming.set(edge.target.nodeId, held);
  }
  return incoming;
}

function toNode(node: GraphSceneNode, incoming: readonly string[]): GraphFlowNode {
  return {
    id: node.id,
    type: node.family,
    position: { x: node.x, y: node.y },
    initialWidth: node.w,
    initialHeight: node.h,
    ...(FIXED_FAMILIES.has(node.family) ? { draggable: false } : {}),
    selectable: true,
    focusable: true,
    ariaRole: 'group',
    data: { scene: node, incoming },
  };
}

export function toEdge(
  edge: GraphSceneEdge,
  taken: ReadonlySet<string>,
  route: ExecWireRoute = NO_ROUTE,
): GraphFlowEdge {
  const exec = edge.kind === 'exec';
  const state = [
    edge.state === 'problem' ? 'gc-problem' : '',
    taken.has(edge.id) ? 'gc-taken' : '',
  ].filter((name) => name !== '');
  return {
    id: edge.id,
    type: edge.kind,
    source: edge.source.nodeId,
    sourceHandle: edge.source.handle,
    target: edge.target.nodeId,
    targetHandle: edge.target.handle,
    className: ['gc-edge', exec ? 'gc-edge-exec' : 'gc-edge-value', ...state].join(' '),
    zIndex: exec ? EXEC_LAYER : VALUE_LAYER,
    focusable: false,
    interactionWidth: exec ? 44 : 20,
    data: {
      scene: edge,
      points: route.points,
      around: route.around,
      wires: route.wires,
      shift: route.shift,
    },
  };
}

export function buildGraphNodes(scene: GraphScene): GraphFlowNode[] {
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));
  const incoming = incomingOf(scene, byId);
  return scene.nodes.map((node) => toNode(node, incoming.get(node.id) ?? []));
}

export function buildGraphEdges(scene: GraphScene, taken: readonly string[]): GraphFlowEdge[] {
  const set = new Set(taken);
  const routes = execWireRoutes(scene);
  return scene.edges.map((edge) => toEdge(edge, set, routes.get(edge.id)));
}

export function pairRing(scene: GraphScene, selection: readonly string[]): ReadonlySet<string> {
  const chosen = new Set(selection);
  const pairs = new Set(
    scene.nodes.flatMap((node) =>
      chosen.has(node.id) && node.pairIndex !== null ? [node.pairIndex] : [],
    ),
  );
  return new Set(
    scene.nodes
      .filter((node) => node.pairIndex !== null && pairs.has(node.pairIndex))
      .map((node) => node.id),
  );
}

export function withSelection(
  nodes: GraphFlowNode[],
  scene: GraphScene,
  selection: readonly string[],
): GraphFlowNode[] {
  const chosen = new Set(selection);
  const ringed = pairRing(scene, selection);
  return nodes.map((node) => {
    const className = ringed.has(node.id) ? 'gc-ringed' : '';
    const isSelected = chosen.has(node.id);
    if ((node.selected === true) === isSelected && (node.className ?? '') === className)
      return node;
    return { ...node, selected: isSelected, className };
  });
}
