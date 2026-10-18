import type { KeyPress } from '../../../design/keyboard';
import { modifierLabel } from '../../../design/platform';
import { localPref, useLocalPref, type LocalPrefValue } from '../../../store/local-prefs';

export type QuickAskShortcut = LocalPrefValue<'quickAskShortcut'>;

interface Chord {
  readonly shift: boolean;
  readonly alt: boolean;
  readonly name: string;
}

const CHORDS: Readonly<Record<QuickAskShortcut, Chord>> = {
  space: { shift: false, alt: false, name: 'Space' },
  'shift-space': { shift: true, alt: false, name: 'Shift Space' },
  'alt-space': { shift: false, alt: true, name: 'Alt Space' },
};

export function quickAskKeys(shortcut: QuickAskShortcut): string {
  return `${modifierLabel()} ${CHORDS[shortcut].name}`;
}

export function pressesQuickAsk(press: KeyPress, shortcut: QuickAskShortcut): boolean {
  const chord = CHORDS[shortcut];
  return (
    press.command && press.key === ' ' && press.shift === chord.shift && press.alt === chord.alt
  );
}

export function matchesQuickAskShortcut(press: KeyPress): boolean {
  return pressesQuickAsk(press, localPref('quickAskShortcut'));
}

export function useQuickAskKeys(): string {
  return quickAskKeys(useLocalPref('quickAskShortcut'));
}
