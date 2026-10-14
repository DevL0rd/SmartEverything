import { useEffect, useEffectEvent } from 'react';
import type { BrowserTab, BrowserTabId } from './browser-tab-state';
export function focusBrowserTab(id: string | null): void {
  if (typeof document === 'undefined') return;
  const root =
    id === null
      ? document.getElementById('browser-tab-strip')
      : document.getElementById(`browser-tab-${id}`);
  const control = root?.querySelector(
    id === null ? '[aria-label="New browser tab"]' : '[role="tab"]',
  );
  if (control instanceof HTMLElement) control.focus();
}
export function useTabStripKeyboard(
  props: {
    readonly tabs: readonly BrowserTab[];
    readonly onSelect: (id: BrowserTabId) => void;
    readonly onClose: (id: BrowserTabId) => void;
  },
  move: (id: string, offset: -1 | 1) => void,
  cancel: () => void,
): void {
  const receive = useEffectEvent((event: KeyboardEvent): void => {
    if (!(event.target instanceof HTMLElement)) return;
    const root = event.target.closest('[id^="browser-tab-"]');
    if (root === null || root.id === 'browser-tab-strip') return;
    const id = root.id.slice('browser-tab-'.length);
    const index = props.tabs.findIndex((tab) => tab.id === id);
    const tab = props.tabs[index];
    if (tab === undefined) return;
    if (editTabKey(event, tab.id, { move, close: props.onClose, cancel })) return;
    const next = focusedIndex(event.key, index, props.tabs.length);
    if (next === null) return;
    event.preventDefault();
    const target = props.tabs[next];
    if (target !== undefined) focusBrowserTab(target.id);
  });
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    document.addEventListener('keydown', receive);
    return (): void => {
      document.removeEventListener('keydown', receive);
    };
  }, []);
}
function focusedIndex(key: string, index: number, length: number): number | null {
  switch (key) {
    case 'ArrowLeft':
      return (index + arrowOffset(key) + length) % length;
    case 'ArrowRight':
      return (index + arrowOffset(key) + length) % length;
    case 'Home':
      return 0;
    case 'End':
      return length - 1;
    default:
      return null;
  }
}

function editTabKey(
  event: KeyboardEvent,
  id: BrowserTabId,
  actions: {
    readonly move: (id: string, offset: -1 | 1) => void;
    readonly close: (id: BrowserTabId) => void;
    readonly cancel: () => void;
  },
): boolean {
  if (event.key === 'Escape') {
    actions.cancel();
    return true;
  }
  if (event.key === 'Delete') {
    event.preventDefault();
    actions.close(id);
    return true;
  }
  if (!event.altKey || !event.shiftKey || !['ArrowLeft', 'ArrowRight'].includes(event.key))
    return false;
  event.preventDefault();
  actions.move(id, arrowOffset(event.key));
  focusBrowserTab(id);
  return true;
}

function arrowOffset(key: string): -1 | 1 {
  const rtl = document.documentElement.dir === 'rtl';
  return (key === 'ArrowLeft') !== rtl ? -1 : 1;
}
