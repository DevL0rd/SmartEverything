import { useEffect, useEffectEvent, useRef, type RefObject } from 'react';
import { useKeyboard } from '../../../app-shell/shortcuts';
import { useEscape } from '../../../components/use-escape';
import { isNative } from '../../../design/platform';

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex="0"]:not([aria-disabled="true"])';
const REVIEW_KEYS: ReadonlySet<string> = new Set(['r', 'R', '®']);

function contains(root: RefObject<unknown>, target: EventTarget | null): boolean {
  const node = root.current;
  return node instanceof Node && target instanceof Node && node.contains(target);
}

export function focusIsInside(root: RefObject<unknown>): boolean {
  return !isNative() && contains(root, document.activeElement);
}

function focusFirstAction(container: HTMLElement | null): void {
  container?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
}

interface DockFocus {
  readonly onInside: (inside: boolean) => void;
}

export function useDockFocus(
  root: RefObject<unknown>,
  active: RefObject<unknown>,
  { onInside }: DockFocus,
): void {
  const opener = useRef<HTMLElement | null>(null);
  const notify = useEffectEvent(onInside);
  useEffect(() => {
    if (isNative()) return undefined;
    const enter = (event: FocusEvent): void => {
      if (!contains(root, event.target)) return;
      if (!contains(root, event.relatedTarget) && event.relatedTarget instanceof HTMLElement)
        opener.current = event.relatedTarget;
      notify(true);
    };
    const leave = (event: FocusEvent): void => {
      if (contains(root, event.target) && !contains(root, event.relatedTarget)) notify(false);
    };
    document.addEventListener('focusin', enter);
    document.addEventListener('focusout', leave);
    return (): void => {
      document.removeEventListener('focusin', enter);
      document.removeEventListener('focusout', leave);
    };
  }, [root]);
  useEscape(
    true,
    () => {
      const back = opener.current;
      if (back?.isConnected === true) back.focus();
      else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    },
    root,
  );
  useKeyboard((press) => {
    if (!press.alt || !REVIEW_KEYS.has(press.key)) return false;
    const node = active.current;
    if (!(node instanceof HTMLElement)) return false;
    focusFirstAction(node);
    return true;
  }, true);
}
