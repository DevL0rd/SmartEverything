import { useEffect } from 'react';
import { keyPressOf, type KeyPress } from '../design/keyboard';
import { isNative } from '../design/platform';

export type { KeyPress } from '../design/keyboard';

export interface Chord {
  readonly key: string;
  readonly alsoKeys?: readonly string[];
  readonly label?: string;
  readonly command?: boolean;
  readonly alt?: boolean;
  readonly shift?: boolean;
}

export const SHORTCUT_SCOPES = [
  'Anywhere',
  'AI area',
  'Conversation',
  'Message field',
  'Model panel',
] as const;

export type ShortcutScope = (typeof SHORTCUT_SCOPES)[number];

export interface Shortcut {
  readonly id: string;
  readonly label: string;
  readonly scope: ShortcutScope;
  readonly chords: readonly Chord[];
  readonly isNew?: boolean;
  readonly alternative?: string;
  readonly reserved?: boolean;
}

const mod = { command: true } as const;
const modShift = { command: true, shift: true } as const;

export const SHORTCUTS: readonly Shortcut[] = [
  {
    id: 'search',
    label: 'Search',
    scope: 'Anywhere',
    chords: [{ key: 'k', ...mod }, { key: '/' }],
  },
  { id: 'settings', label: 'Settings', scope: 'Anywhere', chords: [{ key: ',', ...mod }] },
  {
    id: 'quick-ask',
    label: 'Ask the assistant',
    scope: 'Anywhere',
    chords: [{ key: ' ', label: 'Space', ...mod }],
  },
  {
    id: 'talk-to-ai',
    label: 'Talk to the AI, from any app',
    scope: 'Anywhere',
    chords: [{ key: 'a', command: true, alt: true }],
    isNew: true,
  },
  {
    id: 'space',
    label: 'Go to a space',
    scope: 'Anywhere',
    chords: [
      { key: '1', alsoKeys: ['2', '3', '4', '5', '6', '7', '8', '9'], label: '1–9', ...mod },
    ],
  },
  {
    id: 'sidebar',
    label: 'Collapse the sidebar',
    scope: 'Anywhere',
    chords: [{ key: 'b', ...mod }],
  },
  {
    id: 'escape',
    label: 'Close, leave edit mode, clear search',
    scope: 'Anywhere',
    chords: [{ key: 'Escape', label: 'Esc' }],
  },
  { id: 'edit-layout', label: 'Edit layout', scope: 'Anywhere', chords: [{ key: 'e' }] },
  {
    id: 'back',
    label: 'Back',
    scope: 'Anywhere',
    chords: [{ key: 'ArrowLeft', label: '←', alt: true }],
  },
  {
    id: 'forward',
    label: 'Forward',
    scope: 'Anywhere',
    chords: [{ key: 'ArrowRight', label: '→', alt: true }],
  },
  { id: 'help', label: 'Show shortcuts', scope: 'Anywhere', chords: [{ key: '?' }] },
  {
    id: 'undo',
    label: 'Undo the latest Undo toast',
    scope: 'Anywhere',
    chords: [{ key: 'z', ...mod }],
    isNew: true,
  },
  {
    id: 'new-chat',
    label: 'New chat',
    scope: 'AI area',
    chords: [{ key: 'o', ...modShift }],
  },
  {
    id: 'chat-list',
    label: 'Show or hide the chat list',
    scope: 'AI area',
    chords: [{ key: '\\', ...mod }],
  },
  {
    id: 'previous-chat',
    label: 'Previous chat',
    scope: 'AI area',
    chords: [{ key: 'ArrowUp', label: '↑', alt: true }],
  },
  {
    id: 'next-chat',
    label: 'Next chat',
    scope: 'AI area',
    chords: [{ key: 'ArrowDown', label: '↓', alt: true }],
  },
  {
    id: 'focus-composer',
    label: 'Focus the message field',
    scope: 'Conversation',
    chords: [{ key: '/', ...mod }],
  },
  { id: 'browser', label: 'Browser dock', scope: 'Conversation', chords: [{ key: 'i', ...mod }] },
  {
    id: 'copy-reply',
    label: 'Copy the latest reply',
    scope: 'Conversation',
    chords: [{ key: 'c', ...modShift }],
  },
  {
    id: 'model-panel',
    label: 'Model panel',
    scope: 'Conversation',
    chords: [{ key: '.', ...mod, shift: false }],
    isNew: true,
    alternative: 'Model and thinking button',
  },
  {
    id: 'thinking',
    label: 'Cycle the thinking level',
    scope: 'Conversation',
    chords: [{ key: 'e', ...modShift }],
    isNew: true,
    alternative: 'Thinking row in the model panel',
  },
  {
    id: 'access',
    label: 'Access panel',
    scope: 'Conversation',
    chords: [{ key: 'l', ...modShift }],
    isNew: true,
    alternative: 'Access button in the message field',
    reserved: true,
  },
  {
    id: 'details',
    label: 'Chat details',
    scope: 'Conversation',
    chords: [{ key: 'd', ...modShift }],
    isNew: true,
    alternative: 'The strip above the message field',
    reserved: true,
  },
  {
    id: 'review',
    label: 'Review the request',
    scope: 'Conversation',
    chords: [{ key: 'r', alt: true }],
    isNew: true,
    alternative: 'Review button in the request card',
  },
  {
    id: 'library',
    label: 'Model library',
    scope: 'Model panel',
    chords: [{ key: 'l', ...mod, shift: false }],
    isNew: true,
    alternative: 'Model library row at the bottom',
    reserved: true,
  },
  {
    id: 'send',
    label: 'Send (or queue while a reply runs)',
    scope: 'Message field',
    chords: [{ key: 'Enter', label: 'Enter', shift: false }],
  },
  {
    id: 'newline',
    label: 'New line',
    scope: 'Message field',
    chords: [{ key: 'Enter', label: 'Enter', shift: true }],
  },
  {
    id: 'edit-latest',
    label: 'Edit your latest message',
    scope: 'Message field',
    chords: [{ key: 'ArrowUp', label: '↑' }],
  },
];

export function chordParts(chord: Chord, mac: boolean): readonly string[] {
  const key = chord.label ?? chord.key.toUpperCase();
  return [
    ...(chord.command === true ? [mac ? '⌘' : 'Ctrl'] : []),
    ...(chord.alt === true ? ['Alt'] : []),
    ...(chord.shift === true ? [mac ? '⇧' : 'Shift'] : []),
    key,
  ];
}

export function reservedKeys(mac: boolean): string {
  const keys = SHORTCUTS.filter((shortcut) => shortcut.reserved === true).flatMap((shortcut) =>
    shortcut.chords.map((chord) => chordParts(chord, mac).join(mac ? '' : '+')),
  );
  const last = keys.at(-1);
  return last === undefined || keys.length === 1
    ? keys.join('')
    : `${keys.slice(0, -1).join(', ')} and ${last}`;
}

export function chordMatches(press: KeyPress, chord: Chord): boolean {
  return (
    [chord.key, ...(chord.alsoKeys ?? [])].some(
      (key) => key.toLowerCase() === press.key.toLowerCase(),
    ) &&
    press.command === (chord.command === true) &&
    press.alt === (chord.alt === true) &&
    (chord.shift === undefined || press.shift === chord.shift)
  );
}

export function shortcutOf(press: KeyPress, scope?: ShortcutScope): Shortcut | undefined {
  return SHORTCUTS.find(
    (shortcut) =>
      (scope === undefined || shortcut.scope === scope) &&
      shortcut.chords.some((chord) => chordMatches(press, chord)),
  );
}

export function shortcutPressed(press: KeyPress, id: Shortcut['id']): boolean {
  const shortcut = SHORTCUTS.find((candidate) => candidate.id === id);
  return shortcut?.chords.some((chord) => chordMatches(press, chord)) === true;
}

export type ShortcutFilter = ShortcutScope | 'All';

export function filteredShortcuts(query: string, scope: ShortcutFilter): readonly Shortcut[] {
  const needle = query.trim().toLowerCase();
  return SHORTCUTS.filter(
    (shortcut) =>
      (scope === 'All' || shortcut.scope === scope) &&
      `${shortcut.label} ${shortcut.scope}`.toLowerCase().includes(needle),
  );
}

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
