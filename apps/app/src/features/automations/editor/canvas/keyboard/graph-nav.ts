import type {
  GraphScene,
  GraphSceneEdge,
  GraphSceneNode,
} from '../../../model/graph/scene-contract';

export type Step = -1 | 1;

function nodeOf(scene: GraphScene, id: string): GraphSceneNode | undefined {
  return scene.nodes.find((node) => node.id === id);
}

function execFrom(scene: GraphScene, id: string): readonly GraphSceneEdge[] {
  const node = nodeOf(scene, id);
  if (node === undefined) return [];
  const rows = [...node.rows].sort(
    (left, right) => Number(right.role === 'next') - Number(left.role === 'next'),
  );
  return rows.flatMap((row) =>
    scene.edges.filter(
      (edge) =>
        edge.kind === 'exec' && edge.source.nodeId === id && edge.source.handle === row.handle,
    ),
  );
}

function valueFrom(scene: GraphScene, id: string): readonly GraphSceneEdge[] {
  return scene.edges.filter((edge) => edge.kind === 'value' && edge.source.nodeId === id);
}

export function followForward(scene: GraphScene, id: string): string | null {
  const edge = execFrom(scene, id)[0] ?? valueFrom(scene, id)[0];
  return edge?.target.nodeId ?? null;
}

export function followBackward(scene: GraphScene, id: string): string | null {
  const exec = scene.edges.find((edge) => edge.kind === 'exec' && edge.target.nodeId === id);
  const edge = exec ?? scene.edges.find((candidate) => candidate.target.nodeId === id);
  return edge?.source.nodeId ?? null;
}

export function siblingOf(scene: GraphScene, id: string, step: Step): string | null {
  const incoming = scene.edges.find((edge) => edge.kind === 'exec' && edge.target.nodeId === id);
  if (incoming === undefined) return null;
  const rows = nodeOf(scene, incoming.source.nodeId)?.rows ?? [];
  const targets = rows.flatMap((row) =>
    scene.edges
      .filter(
        (edge) =>
          edge.kind === 'exec' &&
          edge.source.nodeId === incoming.source.nodeId &&
          edge.source.handle === row.handle,
      )
      .map((edge) => edge.target.nodeId),
  );
  const unique = [...new Set(targets)];
  return unique[unique.indexOf(id) + step] ?? null;
}

export function tabNeighbour(scene: GraphScene, id: string, step: Step): string | null {
  const index = scene.nodes.findIndex((node) => node.id === id);
  if (index < 0) return null;
  return scene.nodes[index + step]?.id ?? null;
}

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export function needsReveal(
  box: Box,
  viewport: { readonly x: number; readonly y: number; readonly zoom: number },
  size: { readonly width: number; readonly height: number },
): boolean {
  const left = box.x * viewport.zoom + viewport.x;
  const top = box.y * viewport.zoom + viewport.y;
  return (
    left < 0 ||
    top < 0 ||
    left + box.w * viewport.zoom > size.width ||
    top + box.h * viewport.zoom > size.height
  );
}
