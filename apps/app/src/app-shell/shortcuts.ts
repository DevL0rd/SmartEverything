import { useEffect } from 'react';
import { keyPressOf, type KeyPress } from '../design/keyboard';
import { isNative, modifierLabel } from '../design/platform';

export type { KeyPress } from '../design/keyboard';

export interface ShortcutHelp {
  readonly keys: string;
  readonly label: string;
}

export const SHORTCUTS: readonly ShortcutHelp[] = [
  { keys: `${modifierLabel()} K`, label: 'Search' },
  { keys: '/', label: 'Search' },
  { keys: `${modifierLabel()} ,`, label: 'Settings' },
  { keys: `${modifierLabel()} Space`, label: 'Ask the assistant' },
  { keys: `${modifierLabel()} 1–6`, label: 'Go to a space' },
  { keys: `${modifierLabel()} B`, label: 'Collapse the sidebar' },
  { keys: 'Esc', label: 'Close, leave edit mode, clear search' },
  { keys: 'E', label: 'Edit layout' },
  { keys: 'Alt ← / Alt →', label: 'Back and forward' },
  { keys: '?', label: 'Show shortcuts' },
];

export function useKeyboard(handle: (press: KeyPress) => boolean, capture = false): void {
  useEffect(() => {
    if (isNative()) {
      return undefined;
    }
    const listen = (event: KeyboardEvent): void => {
      if (handle(keyPressOf(event))) {
        event.preventDefault();
        if (capture) {
          event.stopPropagation();
        }
      }
    };
    document.addEventListener('keydown', listen, { capture });
    return (): void => {
      document.removeEventListener('keydown', listen, { capture });
    };
  }, [handle, capture]);
}
