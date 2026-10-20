import type { Shortcut } from '../../model/canvas/contract';

export type ViewportKey = 'zoomIn' | 'zoomOut' | 'reset' | 'fit' | 'fitSelection';

export type PanKey = 'left' | 'right' | 'up' | 'down';

export interface KeyLike {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

const COMMAND_KEYS: Readonly<Record<string, Shortcut>> = {
  z: 'undo',
  y: 'redo',
  c: 'copy',
  v: 'paste',
  x: 'cut',
  d: 'duplicate',
  g: 'group',
  a: 'selectAll',
};

const VIEWPORT_KEYS: Readonly<Record<string, ViewportKey>> = {
  '+': 'zoomIn',
  '=': 'zoomIn',
  '-': 'zoomOut',
  '0': 'reset',
};

const PAN_KEYS: Readonly<Record<string, PanKey>> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

function commandHeld(event: KeyLike): boolean {
  return event.ctrlKey || event.metaKey;
}

export function shortcutFor(event: KeyLike): Shortcut | null {
  if (!commandHeld(event)) return null;
  const key = event.key.toLowerCase();
  if (key === 'z' && event.shiftKey) return 'redo';
  return COMMAND_KEYS[key] ?? null;
}

export function viewportKeyFor(event: KeyLike): ViewportKey | null {
  if (commandHeld(event) || event.altKey) return null;
  if (event.key.toLowerCase() === 'f') return event.shiftKey ? 'fitSelection' : 'fit';
  return VIEWPORT_KEYS[event.key] ?? null;
}

export function panKeyFor(event: KeyLike): PanKey | null {
  if (commandHeld(event) || event.altKey || event.shiftKey) return null;
  return PAN_KEYS[event.key] ?? null;
}

export function isDeleteKey(event: KeyLike): boolean {
  return !commandHeld(event) && (event.key === 'Delete' || event.key === 'Backspace');
}

export function isOpenKey(event: KeyLike): boolean {
  return event.key === 'Enter' && !commandHeld(event);
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
