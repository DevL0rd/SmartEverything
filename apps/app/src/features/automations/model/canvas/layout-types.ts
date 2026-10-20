export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export type InsertKind = 'edge' | 'slot' | 'tail';

export interface InsertSpot {
  readonly scope: string;
  readonly index: number;
  readonly placement: InsertKind;
  readonly x: number;
  readonly y: number;
  readonly after: string | null;
  readonly before: string | null;
  readonly slotId: string | null;
}

export interface Layouted {
  readonly rects: ReadonlyMap<string, Rect>;
  readonly parents: ReadonlyMap<string, string | null>;
  readonly inserts: readonly InsertSpot[];
  readonly width: number;
  readonly height: number;
}

export interface Acc {
  readonly rects: Map<string, Rect>;
  readonly parents: Map<string, string | null>;
  readonly inserts: InsertSpot[];
}

export function newAcc(): Acc {
  return { rects: new Map(), parents: new Map(), inserts: [] };
}

export function put(acc: Acc, id: string, rect: Rect, parent: string | null): void {
  acc.rects.set(id, rect);
  acc.parents.set(id, parent);
}

export function boundsOf(rects: Iterable<Rect>): { width: number; height: number } {
  let width = 0;
  let height = 0;
  for (const rect of rects) {
    width = Math.max(width, rect.x + rect.w);
    height = Math.max(height, rect.y + rect.h);
  }
  return { width, height };
}

export function finish(acc: Acc): Layouted {
  const { width, height } = boundsOf(acc.rects.values());
  return { ...acc, width, height };
}
