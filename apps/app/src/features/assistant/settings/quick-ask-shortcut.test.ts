import { describe, expect, it, vi } from 'vitest';
import type { KeyPress } from '../../../design/keyboard';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn().mockResolvedValue(undefined) },
}));

const { QUICK_ASK_SHORTCUTS, setLocalPref } = await import('../../../store/local-prefs');
const { matchesQuickAskShortcut, pressesQuickAsk, quickAskKeys } =
  await import('./quick-ask-shortcut');

const press = (change: Partial<KeyPress>): KeyPress => ({
  key: ' ',
  command: true,
  alt: false,
  shift: false,
  typing: false,
  ...change,
});

describe('the Quick Ask shortcut', () => {
  it('is Command or Control plus Space until it is changed', () => {
    expect(matchesQuickAskShortcut(press({}))).toBe(true);
    expect(matchesQuickAskShortcut(press({ shift: true }))).toBe(false);
  });

  it('follows the chosen shortcut and lets go of the old one', () => {
    setLocalPref('quickAskShortcut', 'shift-space');
    expect(matchesQuickAskShortcut(press({ shift: true }))).toBe(true);
    expect(matchesQuickAskShortcut(press({}))).toBe(false);
    setLocalPref('quickAskShortcut', 'space');
  });

  it('needs the command key and the space bar for every choice', () => {
    for (const choice of QUICK_ASK_SHORTCUTS) {
      const chord = { shift: choice === 'shift-space', alt: choice === 'alt-space' };
      expect(pressesQuickAsk(press(chord), choice), choice).toBe(true);
      expect(pressesQuickAsk(press({ ...chord, command: false }), choice), choice).toBe(false);
      expect(pressesQuickAsk(press({ ...chord, key: 'k' }), choice), choice).toBe(false);
    }
  });

  it('gives every choice its own label', () => {
    const labels = QUICK_ASK_SHORTCUTS.map(quickAskKeys);
    expect(new Set(labels).size).toBe(QUICK_ASK_SHORTCUTS.length);
  });
});
