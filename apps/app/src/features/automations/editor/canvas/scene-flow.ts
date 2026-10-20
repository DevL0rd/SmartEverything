import type { Scene, SceneNode } from '../../model/canvas/contract';
import type { CanvasEdge, CanvasNode } from './canvas-types';

const DRAGGABLE: ReadonlySet<SceneNode['role']> = new Set([
  'trigger',
  'step',
  'container',
  'value',
]);

const FOCUSABLE: ReadonlySet<SceneNode['role']> = new Set([
  'trigger',
  'triggerGroup',
  'admit',
  'step',
  'container',
  'value',
  'slot',
  'inputs',
  'exits',
]);

export interface Flow {
  readonly nodes: CanvasNode[];
  readonly edges: CanvasEdge[];
  readonly valuePorts: ReadonlyMap<string, 'in' | 'out'>;
}

export function portKey(nodeId: string, port: string): string {
  return `${nodeId}\u0000${port}`;
}

function toNode(node: SceneNode, selected: ReadonlySet<string>): CanvasNode {
  return {
    id: node.id,
    type: node.role,
    position: { x: node.x, y: node.y },
    width: node.w,
    height: node.h,
    selected: selected.has(node.id),
    draggable: DRAGGABLE.has(node.role),
    selectable: node.role !== 'lane',
    focusable: FOCUSABLE.has(node.role),
    ariaLabel: node.ariaLabel,
    ariaRole: 'group',
    data: { scene: node },
  };
}

function valuePortsOf(scene: Scene): ReadonlyMap<string, 'in' | 'out'> {
  const ports = new Map<string, 'in' | 'out'>();
  for (const node of scene.nodes) {
    for (const port of [...node.ports, ...node.outputs]) {
      ports.set(portKey(node.id, port.name), port.direction);
    }
  }
  return ports;
}

export function buildFlow(scene: Scene, selection: readonly string[]): Flow {
  const selected = new Set(selection);
  const edges = scene.edges.map((edge): CanvasEdge => ({
    id: edge.id,
    type: edge.kind,
    source: edge.from.nodeId,
    sourceHandle: edge.from.port,
    target: edge.to.nodeId,
    targetHandle: edge.to.port,
    focusable: false,
    interactionWidth: edge.kind === 'exec' ? 44 : 20,
    data: { scene: edge },
  }));
  return {
    nodes: scene.nodes.map((node) => toNode(node, selected)),
    edges,
    valuePorts: valuePortsOf(scene),
  };
}
