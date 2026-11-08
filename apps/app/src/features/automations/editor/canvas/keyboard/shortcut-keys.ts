import type { ShortcutName } from '../graph-canvas-types';

export interface ShortcutEvent {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

export type ViewKey = 'zoomIn' | 'zoomOut' | 'reset' | 'fit' | 'fitSelection';

export type PanKey = 'left' | 'right' | 'up' | 'down';

const COMMAND_KEYS: Readonly<Record<string, ShortcutName>> = {
  z: 'undo',
  y: 'redo',
  c: 'copy',
  v: 'paste',
  x: 'cut',
  d: 'duplicate',
  g: 'group',
  a: 'selectAll',
};

const VIEW_KEYS: Readonly<Record<string, ViewKey>> = {
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

export function shortcutOf(event: ShortcutEvent): ShortcutName | null {
  if (!event.ctrlKey && !event.metaKey) return null;
  const key = event.key.toLowerCase();
  if (key === 'z' && event.shiftKey) return 'redo';
  return COMMAND_KEYS[key] ?? null;
}

export function viewKeyOf(event: ShortcutEvent): ViewKey | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (event.key.toLowerCase() === 'f') return event.shiftKey ? 'fitSelection' : 'fit';
  return VIEW_KEYS[event.key] ?? null;
}

export function panKeyOf(event: ShortcutEvent): PanKey | null {
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return null;
  return PAN_KEYS[event.key] ?? null;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
