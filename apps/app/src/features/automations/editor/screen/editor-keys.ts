import type { KeyLike } from '../canvas/shortcuts';
import { shortcutFor } from '../canvas/shortcuts';

export type EditorKey = 'undo' | 'redo' | 'publish' | 'test' | 'help' | 'palette';

function commandHeld(event: KeyLike): boolean {
  return event.ctrlKey || event.metaKey;
}

function commandKey(event: KeyLike, editable: boolean): EditorKey | null {
  if (event.key === 'Enter') return 'test';
  const key = event.key.toLowerCase();
  if (key === 's') return 'publish';
  if (key === 'k') return 'palette';
  const shortcut = editable ? null : shortcutFor(event);
  return shortcut === 'undo' || shortcut === 'redo' ? shortcut : null;
}

export function editorKeyFor(event: KeyLike, editable: boolean): EditorKey | null {
  if (commandHeld(event)) return commandKey(event, editable);
  if (editable || event.altKey) return null;
  if (event.key === '?') return 'help';
  return event.key === '/' ? 'palette' : null;
}

export interface ShortcutRow {
  readonly keys: string;
  readonly action: string;
}

export interface ShortcutGroup {
  readonly title: string;
  readonly rows: readonly ShortcutRow[];
}

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    title: 'Edit',
    rows: [
      { keys: 'Ctrl+Z', action: 'Undo' },
      { keys: 'Ctrl+Shift+Z or Ctrl+Y', action: 'Redo' },
      { keys: 'Ctrl+C, Ctrl+X, Ctrl+V', action: 'Copy, cut, paste' },
      { keys: 'Ctrl+D', action: 'Duplicate' },
      { keys: 'Delete or Backspace', action: 'Delete' },
      { keys: 'Ctrl+G', action: 'Make a Custom Node' },
    ],
  },
  {
    title: 'Move around',
    rows: [
      { keys: 'Tab or Shift+Tab', action: 'Next or previous step' },
      { keys: 'Arrow keys', action: 'Move along the steps, or pan with nothing selected' },
      { keys: '+, -, 0', action: 'Zoom in, zoom out, 100%' },
      { keys: 'F or Shift+F', action: 'Fit all, fit the selection' },
    ],
  },
  {
    title: 'Select',
    rows: [
      { keys: 'Ctrl+click', action: 'Add to the selection' },
      { keys: 'Ctrl+A', action: 'Select everything' },
      { keys: 'Enter', action: 'Open the step options' },
    ],
  },
  {
    title: 'Automation',
    rows: [
      { keys: '/ or Ctrl+K', action: 'Add a step' },
      { keys: 'Ctrl+Enter', action: 'Test' },
      { keys: 'Ctrl+S', action: 'Publish' },
      { keys: '?', action: 'Show these shortcuts' },
    ],
  },
];
