import { useEffect, useState } from 'react';
import type { Placement } from './packer';

export function mountOrder(placements: readonly Placement[]): ReadonlyMap<string, number> {
  const ordered = [...placements].sort((a, b) => a.row - b.row || a.col - b.col);
  return new Map(ordered.map((placement, index) => [placement.widget.key, index]));
}

const RENDER_AHEAD_SCREENS = 2;

const STAGGER_STEP = 3;

export function firstScreenCount(
  placements: readonly Placement[],
  rowHeight: number,
  screenHeight: number,
): number {
  const above = placements.filter(
    (placement) => placement.row * rowHeight < screenHeight * RENDER_AHEAD_SCREENS,
  );
  return Math.max(1, above.length);
}

function useStaggeredCount(total: number, first: number): number {
  const [count, setCount] = useState(first);
  useEffect(() => {
    if (count >= total) {
      return undefined;
    }
    const frame = requestAnimationFrame(() => {
      setCount(count + STAGGER_STEP);
    });
    return (): void => {
      cancelAnimationFrame(frame);
    };
  }, [count, total]);
  return Math.min(count, total);
}

const SETTLED = new Map<string, number>();

function settledCount(page: string): number {
  return SETTLED.get(page) ?? 0;
}

export function settle(page: string, mounted: number): void {
  SETTLED.set(page, Math.max(settledCount(page), mounted));
}

export function forgetSettled(): void {
  SETTLED.clear();
}

export function firstMount(
  page: string,
  placements: readonly Placement[],
  rowHeight: number,
  screenHeight: number,
): number {
  return Math.max(firstScreenCount(placements, rowHeight, screenHeight), settledCount(page));
}

export function useBoardStagger(
  page: string,
  placements: readonly Placement[],
  rowHeight: number,
  screenHeight: number,
): number {
  const [first] = useState(() => firstMount(page, placements, rowHeight, screenHeight));
  const mounted = useStaggeredCount(placements.length, first);
  useEffect(() => {
    settle(page, mounted);
  }, [page, mounted]);
  return mounted;
}
