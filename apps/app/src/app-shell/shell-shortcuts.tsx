import type { ReactNode, RefObject } from 'react';
import { useState } from 'react';
import { View, type TextInput } from 'react-native';
import { router } from 'expo-router';
import { Sheet } from '../components/sheet';
import { openQuickAsk } from '../features/assistant';
import { Text } from '../components/text';
import { openSearch } from '../search/open-search';
import { closeSearchOverlay } from '../search/overlay-state';
import { href } from './hrefs';
import type { NavEntry } from './nav-model';
import { SHORTCUTS, useKeyboard, type KeyPress } from './shortcuts';

export interface ShellShortcutTargets {
  readonly searchRef: RefObject<TextInput | null>;
  readonly entries: readonly NavEntry[];
  readonly go: (entry: NavEntry) => void;
  readonly toggleSidebar: () => void;
}

function focusSearch(targets: ShellShortcutTargets): void {
  if (targets.searchRef.current === null) {
    openSearch();
    return;
  }
  targets.searchRef.current.focus();
}

function anywhereKey(press: KeyPress, targets: ShellShortcutTargets): boolean {
  if (press.command && press.key.toLowerCase() === 'k') {
    focusSearch(targets);
    return true;
  }
  if (press.command && press.key === ' ') {
    openQuickAsk();
    return true;
  }
  if (press.command && press.key === ',') {
    router.navigate(href.settings.index());
    return true;
  }
  if (press.key === 'Escape' && !press.command && !press.alt) {
    closeSearchOverlay();
    return false;
  }
  return false;
}

function commandKey(press: KeyPress, targets: ShellShortcutTargets): boolean {
  const index = Number.parseInt(press.key, 10);
  if (press.key.toLowerCase() === 'b') {
    targets.toggleSidebar();
    return true;
  }
  const entry = Number.isNaN(index) ? undefined : targets.entries[index - 1];
  if (entry !== undefined) {
    targets.go(entry);
    return true;
  }
  return false;
}

function plainKey(press: KeyPress, targets: ShellShortcutTargets, showHelp: () => void): boolean {
  if (press.alt && press.key === 'ArrowLeft') {
    router.back();
    return true;
  }
  if (press.alt && press.key === 'ArrowRight') {
    window.history.forward();
    return true;
  }
  if (press.typing) {
    return false;
  }
  if (press.key === '/') {
    focusSearch(targets);
    return true;
  }
  if (press.key === '?') {
    showHelp();
    return true;
  }
  return false;
}

export function ShellShortcuts(targets: ShellShortcutTargets): ReactNode {
  const [help, setHelp] = useState(false);
  useKeyboard((press) => anywhereKey(press, targets), true);
  useKeyboard((press) =>
    press.command
      ? commandKey(press, targets)
      : plainKey(press, targets, () => {
          setHelp(true);
        }),
  );
  return (
    <Sheet
      open={help}
      onClose={() => {
        setHelp(false);
      }}
      title="Keyboard shortcuts"
      detents={['fit']}
    >
      <View className="gap-2">
        {SHORTCUTS.map((shortcut) => (
          <View
            key={`${shortcut.keys}${shortcut.label}`}
            className="flex-row items-center justify-between gap-4 py-1"
          >
            <Text variant="body">{shortcut.label}</Text>
            <View className="rounded-xs border border-outline px-2 py-0.5">
              <Text variant="caption" tone="variant">
                {shortcut.keys}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </Sheet>
  );
}
