import type { FlowNode } from '@smarteverything/domain';
import { GAP } from './metrics';
import type { ValueAnchors } from './layout-values';

export interface Extent {
  readonly main: number;
  readonly cross: number;
}

export interface Box extends Extent {
  readonly m: number;
  readonly c: number;
}

function hits(a: Box, b: Box): boolean {
  const pad = GAP.valueStack;
  return (
    a.m < b.m + b.main + pad &&
    b.m < a.m + a.main + pad &&
    a.c < b.c + b.cross + pad &&
    b.c < a.c + a.cross + pad
  );
}

function stackExtent(extents: readonly Extent[]): Extent {
  return {
    main: Math.max(0, ...extents.map((extent) => extent.main)),
    cross:
      extents.reduce((sum, extent) => sum + extent.cross, 0) +
      GAP.valueStack * Math.max(0, extents.length - 1),
  };
}

function freeSpot(card: Box, size: Extent, placed: readonly Box[]): Box {
  let box: Box = {
    m: card.m - GAP.value - size.main,
    c: card.c - GAP.valueAbove - size.cross,
    ...size,
  };
  for (;;) {
    const colliders = placed.filter((other) => hits(box, other));
    if (colliders.length === 0) return box;
    const top = Math.min(...colliders.map((other) => other.c));
    box = { ...box, c: top - GAP.valueAbove - size.cross };
  }
}

function byPosition(cards: ReadonlyMap<string, Box>): readonly [string, Box][] {
  return [...cards].sort(([, a], [, b]) => a.m - b.m || a.c - b.c);
}

export function placeBands(
  cards: ReadonlyMap<string, Box>,
  anchors: ValueAnchors,
  extentOf: (node: FlowNode) => Extent,
): ReadonlyMap<string, Box> {
  const placed: Box[] = [...cards.values()];
  const values = new Map<string, Box>();
  for (const [id, card] of byPosition(cards)) {
    const held = anchors.get(id) ?? [];
    if (held.length === 0) continue;
    const extents = held.map(extentOf);
    const size = stackExtent(extents);
    const spot = freeSpot(card, size, placed);
    placed.push(spot);
    let cursor = spot.c;
    held.forEach((node, index) => {
      const extent = extents[index] ?? size;
      values.set(node.id, { m: spot.m + size.main - extent.main, c: cursor, ...extent });
      cursor += extent.cross + GAP.valueStack;
    });
  }
  return values;
}

export function bandHeight(extents: readonly Extent[]): number {
  return extents.length === 0 ? 0 : stackExtent(extents).cross + GAP.valueAbove;
}
