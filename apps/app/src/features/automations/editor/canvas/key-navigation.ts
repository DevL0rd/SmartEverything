import type { Scene, SceneNode } from '../../model/canvas/contract';

export type NavDirection = 'up' | 'down' | 'left' | 'right';

const NAVIGABLE: ReadonlySet<SceneNode['role']> = new Set([
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

function execNeighbour(scene: Scene, id: string, direction: 'up' | 'down'): string | null {
  const edge = scene.edges.find(
    (candidate) =>
      candidate.kind === 'exec' &&
      (direction === 'down' ? candidate.from.nodeId === id : candidate.to.nodeId === id),
  );
  if (edge === undefined) return null;
  return direction === 'down' ? edge.to.nodeId : edge.from.nodeId;
}

function sideNeighbour(
  scene: Scene,
  current: SceneNode,
  direction: 'left' | 'right',
): string | null {
  const centre = current.y + current.h / 2;
  const sign = direction === 'right' ? 1 : -1;
  const candidates = scene.nodes
    .filter((node) => NAVIGABLE.has(node.role) && node.id !== current.id)
    .filter((node) => node.y <= centre && centre <= node.y + node.h)
    .filter((node) => (node.x - current.x) * sign > 0)
    .sort((a, b) => Math.abs(a.x - current.x) - Math.abs(b.x - current.x));
  return candidates[0]?.id ?? null;
}

export function neighbourOf(scene: Scene, id: string, direction: NavDirection): string | null {
  const current = scene.nodes.find((node) => node.id === id);
  if (current === undefined) return null;
  if (direction === 'up' || direction === 'down') return execNeighbour(scene, id, direction);
  return sideNeighbour(scene, current, direction);
}
