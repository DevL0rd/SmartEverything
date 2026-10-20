import type { ReactNode, RefObject } from 'react';
import { useState } from 'react';
import type { TextInput } from 'react-native';
import { router } from 'expo-router';
import { matchesQuickAskShortcut, openQuickAsk } from '../features/assistant';
import { openSearch } from '../search/open-search';
import { closeSearchOverlay } from '../search/overlay-state';
import { href } from './hrefs';
import { toggleNavFolder } from './nav-edit-actions';
import type { NavEntry, NavModel, NavNodeView } from './nav-model';
import { QUICK_ASK_ID, ShortcutHelp } from './shortcut-help';
import { shortcutOf, shortcutPressed, useKeyboard, type KeyPress } from './shortcuts';

export interface ShellShortcutTargets {
  readonly searchRef: RefObject<TextInput | null>;
  readonly model: NavModel;
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
  if (press.command && shortcutPressed(press, 'search')) {
    focusSearch(targets);
    return true;
  }
  if (matchesQuickAskShortcut(press)) {
    openQuickAsk();
    return true;
  }
  if (shortcutPressed(press, 'settings')) {
    router.navigate(href.settings.index());
    return true;
  }
  if (shortcutPressed(press, 'escape')) {
    closeSearchOverlay();
    return false;
  }
  return false;
}

function numbered(model: NavModel, press: KeyPress): NavNodeView | undefined {
  const index = Number.parseInt(press.key, 10);
  return Number.isNaN(index) ? undefined : [...model.nodes, ...model.system][index - 1];
}

function commandKey(press: KeyPress, targets: ShellShortcutTargets): boolean {
  if (shortcutPressed(press, 'sidebar')) {
    targets.toggleSidebar();
    return true;
  }
  const node = numbered(targets.model, press);
  if (node === undefined) {
    return false;
  }
  if (node.kind === 'folder') toggleNavFolder(node.key);
  else targets.go(node);
  return true;
}

function plainKey(press: KeyPress, targets: ShellShortcutTargets, showHelp: () => void): boolean {
  if (shortcutPressed(press, 'back')) {
    router.back();
    return true;
  }
  if (shortcutPressed(press, 'forward')) {
    window.history.forward();
    return true;
  }
  if (press.typing) {
    return false;
  }
  if (shortcutPressed(press, 'search')) {
    focusSearch(targets);
    return true;
  }
  if (shortcutPressed(press, 'help')) {
    showHelp();
    return true;
  }
  return false;
}

function triedShortcutId(press: KeyPress): string | undefined {
  if (matchesQuickAskShortcut(press)) return QUICK_ASK_ID;
  const found = shortcutOf(press)?.id;
  return found === QUICK_ASK_ID ? undefined : found;
}

function tryShortcut(press: KeyPress, light: (id: string | null) => void): boolean {
  if (press.key === 'Escape' || (press.typing && !press.command && !press.alt)) {
    return false;
  }
  const id = triedShortcutId(press);
  light(id ?? null);
  return id !== undefined;
}

export function ShellShortcuts(targets: ShellShortcutTargets): ReactNode {
  const [help, setHelp] = useState(false);
  const [hit, setHit] = useState<string | null>(null);
  useKeyboard((press) => (help ? tryShortcut(press, setHit) : anywhereKey(press, targets)), true);
  useKeyboard((press) => {
    if (help) return false;
    return press.command
      ? commandKey(press, targets)
      : plainKey(press, targets, () => {
          setHelp(true);
        });
  });
  return (
    <ShortcutHelp
      open={help}
      hit={hit}
      onClose={() => {
        setHelp(false);
        setHit(null);
      }}
    />
  );
}
