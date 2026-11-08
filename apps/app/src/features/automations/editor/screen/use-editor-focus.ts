import { useEffect, useRef, useState, type RefObject } from 'react';
import type { View } from 'react-native';
import { focusInto } from '../../../../design/focus-into';
import { isNative } from '../../../../design/platform';
import { useStableCallback } from '../../../../design/use-stable-callback';

export type FocusTarget = 'inspector' | 'topBar';

export interface EditorFocus {
  readonly topBar: RefObject<View | null>;
  readonly inspector: RefObject<View | null>;
  readonly toInspector: () => void;
  readonly toTopBar: () => void;
}

interface Pending {
  readonly target: FocusTarget;
  readonly seq: number;
}

const FIELD = 'input:not([type="hidden"]),textarea,select,[role="switch"],[role="radio"]';

function elementOf(view: View | null): HTMLElement | null {
  if (isNative()) return null;
  const node: unknown = view;
  return node instanceof HTMLElement ? node : null;
}

export function focusFirstField(view: View | null): void {
  const field = elementOf(view)?.querySelector<HTMLElement>(FIELD);
  if (field === null || field === undefined) focusInto(view);
  else field.focus();
}

export function focusCard(nodeId: string): void {
  if (isNative()) return;
  document
    .querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(nodeId)}"]`)
    ?.focus({ preventScroll: true });
}

function useInspectorEscape(
  inspector: RefObject<View | null>,
  target: string | null,
  onClose: () => void,
): void {
  const close = useStableCallback(onClose);
  useEffect(() => {
    const element = elementOf(inspector.current);
    if (element === null || target === null) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      close();
      focusCard(target);
    };
    element.addEventListener('keydown', onKey);
    return (): void => {
      element.removeEventListener('keydown', onKey);
    };
  }, [inspector, target, close]);
}

export function useEditorFocus(target: string | null, onClose: () => void): EditorFocus {
  const topBar = useRef<View>(null);
  const inspector = useRef<View>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const inspectorOpen = target !== null;
  useInspectorEscape(inspector, target, onClose);
  useEffect(() => {
    if (pending === null) return;
    if (pending.target === 'inspector' && !inspectorOpen) return;
    if (pending.target === 'inspector') focusFirstField(inspector.current);
    else focusInto(topBar.current);
  }, [pending, inspectorOpen]);
  const request = (next: FocusTarget): void => {
    setPending((current) => ({ target: next, seq: (current?.seq ?? 0) + 1 }));
  };
  return {
    topBar,
    inspector,
    toInspector: (): void => {
      request('inspector');
    },
    toTopBar: (): void => {
      request('topBar');
    },
  };
}
