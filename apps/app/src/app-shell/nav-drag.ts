import type { PlaceTarget } from './nav-edits';
import { foldKind, type Foldable } from './nav-fold';

export interface DragRow extends Foldable {
  readonly y: number;
  readonly height: number;
}

export interface Drop {
  readonly place: PlaceTarget;
  readonly into: string | null;
  readonly line: number;
  readonly fold: boolean;
}

const INTO_FROM = 0.25;
const CENTRE_FROM = 0.3;
const CENTRE_TO = 0.7;

function bottomOf(row: DragRow): number {
  return row.y + row.height;
}

function groupOf<T extends Pick<DragRow, 'parent'>>(rows: readonly T[], hit: T): readonly T[] {
  return rows.filter((row) => row.parent === hit.parent);
}

function lineAfter(rows: readonly DragRow[], hit: DragRow): number {
  const last = rows.filter((row) => row.key === hit.key || row.parent === hit.key).at(-1);
  return last === undefined ? bottomOf(hit) : bottomOf(last);
}

function before(hit: DragRow): Drop {
  return { place: { parent: hit.parent, before: hit.key }, into: null, line: hit.y, fold: false };
}

function after(rows: readonly DragRow[], hit: DragRow): Drop {
  const group = groupOf(rows, hit);
  const next = group[group.indexOf(hit) + 1];
  const line = lineAfter(rows, hit);
  const place = { parent: hit.parent, before: next?.key ?? null };
  return { place, into: null, line, fold: false };
}

function into(hit: DragRow): Drop {
  return {
    place: { parent: hit.key, before: null },
    into: hit.key,
    line: hit.y,
    fold: false,
  };
}

function merge(hit: DragRow): Drop {
  return {
    place: { parent: null, before: hit.key },
    into: hit.key,
    line: hit.y,
    fold: true,
  };
}

function rowAt(rows: readonly DragRow[], y: number): DragRow | undefined {
  return rows.find((row) => y >= row.y && y < bottomOf(row));
}

function outside(rows: readonly DragRow[], y: number): Drop | null {
  const first = rows[0];
  if (first === undefined) return null;
  if (y < first.y) return before(first);
  const tops = rows.filter((row) => row.parent === null);
  const lastTop = tops.at(-1);
  if (lastTop === undefined) return null;
  return {
    place: { parent: null, before: null },
    into: null,
    line: lineAfter(rows, lastTop),
    fold: false,
  };
}

function forbidden(dragged: DragRow, hit: DragRow): boolean {
  if (hit.key === dragged.key) return true;
  return dragged.folder && hit.parent !== null;
}

function inCentre(hit: DragRow, y: number): boolean {
  const portion = (y - hit.y) / hit.height;
  return portion >= CENTRE_FROM && portion <= CENTRE_TO;
}

export function foldCandidate(rows: readonly DragRow[], dragKey: string, y: number): string | null {
  const dragged = rows.find((row) => row.key === dragKey);
  const hit = rowAt(rows, y);
  if (dragged === undefined || hit === undefined || dragged.folder) return null;
  if (hit.key === dragged.key || hit.folder || hit.parent !== null) return null;
  return inCentre(hit, y) ? hit.key : null;
}

interface Pointer {
  readonly y: number;
  readonly armed: string | null;
}

function onRow(
  dragged: DragRow,
  hit: DragRow,
  rows: readonly DragRow[],
  { y, armed }: Pointer,
): Drop | null {
  if (forbidden(dragged, hit)) return null;
  if (armed === hit.key && inCentre(hit, y) && foldKind(dragged, hit) === 'create') {
    return merge(hit);
  }
  const portion = (y - hit.y) / hit.height;
  if (hit.folder && !dragged.folder && portion >= INTO_FROM) return into(hit);
  return portion < 0.5 ? before(hit) : after(rows, hit);
}

export function dropAt(
  rows: readonly DragRow[],
  dragKey: string,
  y: number,
  armed: string | null = null,
): Drop | null {
  const dragged = rows.find((row) => row.key === dragKey);
  if (dragged === undefined) return null;
  const hit = rowAt(rows, y);
  return hit === undefined ? outside(rows, y) : onRow(dragged, hit, rows, { y, armed });
}

export function shiftTarget(
  rows: readonly Pick<DragRow, 'key' | 'parent'>[],
  key: string,
  offset: -1 | 1,
): PlaceTarget | null {
  const row = rows.find((candidate) => candidate.key === key);
  if (row === undefined) return null;
  const group = groupOf(rows, row);
  const at = group.indexOf(row);
  if (offset === -1) {
    const previous = group[at - 1];
    return previous === undefined ? null : { parent: row.parent, before: previous.key };
  }
  if (at === group.length - 1) return null;
  return { parent: row.parent, before: group[at + 2]?.key ?? null };
}
