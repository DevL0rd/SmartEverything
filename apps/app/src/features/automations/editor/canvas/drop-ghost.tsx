import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { ViewportPortal, useInternalNode, useReactFlow } from '@xyflow/react';
import type {
  GraphDropGhost,
  GraphFlowEdge,
  GraphFlowNode,
  GraphPoint,
} from './graph-canvas-types';

export const GHOST_SIZE = { w: 248, h: 68 } as const;

const GHOST_CLEAR = 16;

export interface GhostBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

function overlaps(a: GhostBox, b: GhostBox): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function clearSpot(
  at: { readonly x: number; readonly y: number },
  boxes: readonly GhostBox[],
): { readonly x: number; readonly y: number } {
  let spot: GhostBox = { x: at.x, y: at.y, w: GHOST_SIZE.w, h: GHOST_SIZE.h };
  for (;;) {
    const hit = boxes.filter((box) => overlaps(spot, box));
    if (hit.length === 0) return { x: spot.x, y: spot.y };
    spot = { ...spot, y: Math.max(...hit.map((box) => box.y + box.h)) + GHOST_CLEAR };
  }
}

function ghostStyle(at: { readonly x: number; readonly y: number }): CSSProperties {
  return {
    transform: `translate(${String(at.x)}px, ${String(at.y)}px)`,
    width: GHOST_SIZE.w,
    height: GHOST_SIZE.h,
  };
}

function wirePath(from: GraphPoint, to: GraphPoint): string {
  const mid = (from.x + to.x) / 2;
  return `M ${String(from.x)},${String(from.y)} C ${String(mid)},${String(from.y)} ${String(mid)},${String(to.y)} ${String(to.x)},${String(to.y)}`;
}

function GhostWire({
  ghost,
  to,
}: {
  readonly ghost: GraphDropGhost;
  readonly to: GraphPoint;
}): ReactNode {
  const node = useInternalNode<GraphFlowNode>(ghost.nodeId);
  const bounds = node?.internals.handleBounds?.[ghost.side === 'out' ? 'source' : 'target'];
  const handle = bounds?.find((item) => item.id === ghost.handle);
  if (node === undefined || handle === undefined) return null;
  const origin = node.internals.positionAbsolute;
  const pinY = origin.y + handle.y + handle.height / 2;
  const cardY = to.y + GHOST_SIZE.h / 2;
  const d =
    ghost.side === 'out'
      ? wirePath({ x: origin.x + handle.x + handle.width, y: pinY }, { x: to.x, y: cardY })
      : wirePath({ x: to.x + GHOST_SIZE.w, y: cardY }, { x: origin.x + handle.x, y: pinY });
  return (
    <svg className="gc-ghost-wire" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export function DropGhost({ ghost }: { readonly ghost: GraphDropGhost | null }): ReactNode {
  const flow = useReactFlow<GraphFlowNode, GraphFlowEdge>();
  if (ghost === null) return null;
  const boxes = flow.getNodes().map((node) => ({
    x: node.position.x,
    y: node.position.y,
    w: node.measured?.width ?? node.data.scene.w,
    h: node.measured?.height ?? node.data.scene.h,
  }));
  const at = clearSpot(ghost, boxes);
  return (
    <ViewportPortal>
      <GhostWire ghost={ghost} to={at} />
      <div className="gc-ghost" aria-hidden style={ghostStyle(at)}>
        New step
      </div>
    </ViewportPortal>
  );
}

export function useRevealGhostSource(
  ghost: GraphDropGhost | null,
  reveal: (id: string) => void,
): void {
  const source = ghost?.nodeId ?? null;
  useEffect(() => {
    if (source !== null) reveal(source);
  }, [source, reveal]);
}
