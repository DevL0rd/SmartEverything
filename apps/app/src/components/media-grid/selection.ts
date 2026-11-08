import { useEffect, useRef, useState, type RefObject } from 'react';
import { count } from '../../format/number';

export interface MediaSelection {
  readonly active: boolean;
  readonly ids: ReadonlySet<string>;
  readonly anchor: string | null;
}

export type DayMark = 'none' | 'some' | 'all';

export interface DragExtend {
  readonly base: ReadonlySet<string>;
  readonly from: string;
  readonly adding: boolean;
}

export interface PressModifiers {
  readonly shift: boolean;
}

export const NO_SELECTION: MediaSelection = { active: false, ids: new Set(), anchor: null };

export function beginSelecting(selection: MediaSelection): MediaSelection {
  return selection.active ? selection : { ...selection, active: true };
}

export function toggleItem(selection: MediaSelection, id: string): MediaSelection {
  const ids = new Set(selection.ids);
  if (ids.has(id)) ids.delete(id);
  else ids.add(id);
  return { active: true, ids, anchor: id };
}

export function rangeOf(order: readonly string[], from: string, to: string): readonly string[] {
  const start = order.indexOf(from);
  const end = order.indexOf(to);
  if (start === -1 || end === -1) return end === -1 ? [] : [to];
  return order.slice(Math.min(start, end), Math.max(start, end) + 1);
}

export function selectRange(
  selection: MediaSelection,
  order: readonly string[],
  id: string,
): MediaSelection {
  if (selection.anchor === null) return toggleItem(selection, id);
  const ids = new Set(selection.ids);
  for (const each of rangeOf(order, selection.anchor, id)) ids.add(each);
  return { active: true, ids, anchor: id };
}

export function dayMark(selection: MediaSelection, ids: readonly string[]): DayMark {
  const picked = ids.filter((id) => selection.ids.has(id)).length;
  if (picked === 0) return 'none';
  return picked === ids.length ? 'all' : 'some';
}

export function toggleDay(selection: MediaSelection, ids: readonly string[]): MediaSelection {
  const next = new Set(selection.ids);
  const all = dayMark(selection, ids) === 'all';
  for (const id of ids) {
    if (all) next.delete(id);
    else next.add(id);
  }
  return { active: true, ids: next, anchor: ids.at(-1) ?? selection.anchor };
}

export function startDrag(selection: MediaSelection, id: string): DragExtend {
  return { base: selection.ids, from: id, adding: !selection.ids.has(id) };
}

export function dragTo(drag: DragExtend, order: readonly string[], id: string): MediaSelection {
  const ids = new Set(drag.base);
  for (const each of rangeOf(order, drag.from, id)) {
    if (drag.adding) ids.add(each);
    else ids.delete(each);
  }
  return { active: true, ids, anchor: id };
}

export function selectAll(order: readonly string[]): MediaSelection {
  return { active: true, ids: new Set(order), anchor: order.at(-1) ?? null };
}

export function selectedText(selection: MediaSelection): string {
  return `${count(selection.ids.size)} selected`;
}

export function dayActionText(mark: DayMark): string {
  return mark === 'all' ? 'Deselect' : 'Select';
}

export interface MediaSelectionControls {
  readonly selection: MediaSelection;
  readonly begin: () => void;
  readonly clear: () => void;
  readonly all: () => void;
  readonly press: (id: string, modifiers: PressModifiers) => boolean;
  readonly day: (ids: readonly string[]) => void;
  readonly dragStart: (id: string) => void;
  readonly dragOver: (id: string) => void;
  readonly dragEnd: () => void;
}

function useLatestOrder(order: readonly string[]): RefObject<readonly string[]> {
  const latest = useRef(order);
  useEffect(() => {
    latest.current = order;
  });
  return latest;
}

export function useMediaSelection(order: readonly string[]): MediaSelectionControls {
  const [selection, setSelection] = useState(NO_SELECTION);
  const [drag, setDrag] = useState<DragExtend | null>(null);
  const latest = useLatestOrder(order);
  return {
    selection,
    begin: (): void => {
      setSelection(beginSelecting);
    },
    clear: (): void => {
      setDrag(null);
      setSelection(NO_SELECTION);
    },
    all: (): void => {
      setSelection(selectAll(latest.current));
    },
    press: (id, modifiers): boolean => {
      if (!selection.active) return false;
      setSelection(
        modifiers.shift ? selectRange(selection, latest.current, id) : toggleItem(selection, id),
      );
      return true;
    },
    day: (ids): void => {
      setSelection((current) => toggleDay(current, ids));
    },
    dragStart: (id): void => {
      const started = startDrag(selection, id);
      setDrag(started);
      setSelection(dragTo(started, latest.current, id));
    },
    dragOver: (id): void => {
      if (drag !== null) setSelection(dragTo(drag, latest.current, id));
    },
    dragEnd: (): void => {
      setDrag(null);
    },
  };
}
