import { useRef, useState, type RefObject } from 'react';
import { selectionTick, warningBuzz } from '../platform/haptics';
import { dropAt, foldCandidate, type Drop, type DragRow } from './nav-drag';
import type { PlaceTarget } from './nav-edits';
import { foldKind } from './nav-fold';
import type { NavRow } from './nav-rows';
import { useHoverTarget } from './use-hover-target';

interface Measured {
  readonly y: number;
  readonly height: number;
}

export interface NavDrag {
  readonly dragKey: string | null;
  readonly drop: Drop | null;
  readonly measure: (key: string, y: number, height: number) => void;
  readonly topOf: (key: string) => number;
  readonly lift: (key: string) => void;
  readonly move: (key: string, pointerY: number) => void;
  readonly release: (key: string) => boolean;
}

function sameDrop(left: Drop | null, right: Drop | null): boolean {
  if (left === null || right === null) return left === right;
  return (
    left.line === right.line &&
    left.fold === right.fold &&
    left.into === right.into &&
    left.place.parent === right.place.parent &&
    left.place.before === right.place.before
  );
}

function measuredRows(
  rows: readonly NavRow[],
  measured: ReadonlyMap<string, Measured>,
): readonly DragRow[] {
  return rows.flatMap((row) => {
    const at = measured.get(row.key);
    if (at === undefined) return [];
    const fixed =
      row.kind === 'entry' && row.entry.kind === 'section' && row.entry.tab === 'assistant';
    return [{ key: row.key, folder: row.kind === 'folder', parent: row.parent, fixed, ...at }];
  });
}

function announce(all: readonly DragRow[], dragKey: string | null, target: string): boolean {
  const dragged = all.find((row) => row.key === dragKey);
  const hit = all.find((row) => row.key === target);
  if (dragged === undefined || hit === undefined) return false;
  if (foldKind(dragged, hit) === 'create') selectionTick();
  else warningBuzz();
  return true;
}

function settle(
  target: Drop,
  key: string,
  place: (key: string, target: PlaceTarget) => void,
  fold: (dragged: string, target: string) => void,
): void {
  if (target.fold && target.into !== null) fold(key, target.into);
  else place(key, target.place);
}

function useDropState(): {
  readonly drop: Drop | null;
  readonly latest: RefObject<Drop | null>;
  readonly change: (next: Drop | null) => void;
  readonly clear: () => void;
} {
  const [drop, setDrop] = useState<Drop | null>(null);
  const latest = useRef<Drop | null>(null);
  const change = (next: Drop | null): void => {
    if (sameDrop(latest.current, next)) return;
    latest.current = next;
    setDrop(next);
  };
  const clear = (): void => {
    latest.current = null;
    setDrop(null);
  };
  return { drop, latest, change, clear };
}

export function useNavDrag(
  rows: readonly NavRow[],
  place: (key: string, target: PlaceTarget) => void,
  fold: (dragged: string, target: string) => void,
): NavDrag {
  const measured = useRef(new Map<string, Measured>());
  const [dragKey, setDragKey] = useState<string | null>(null);
  const { drop, latest, change, clear } = useDropState();
  const dragging = useRef<string | null>(null);
  const pointer = useRef(0);
  const hover = useHoverTarget<string>((target) => {
    const all = measuredRows(rows, measured.current);
    const key = dragging.current;
    if (key !== null && announce(all, key, target))
      change(dropAt(all, key, pointer.current, target));
  });
  return {
    dragKey,
    drop,
    measure: (key, y, height): void => {
      measured.current.set(key, { y, height });
    },
    topOf: (key): number => measured.current.get(key)?.y ?? 0,
    lift: (key): void => {
      dragging.current = key;
      setDragKey(key);
    },
    move: (key, pointerY): void => {
      pointer.current = pointerY;
      const all = measuredRows(rows, measured.current);
      hover.observe(foldCandidate(all, key, pointerY));
      change(dropAt(all, key, pointerY, hover.armed()));
    },
    release: (key): boolean => {
      const target = latest.current;
      clear();
      dragging.current = null;
      hover.reset();
      setDragKey(null);
      if (target === null) return false;
      settle(target, key, place, fold);
      return true;
    },
  };
}
