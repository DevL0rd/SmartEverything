import {
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useRef,
  type Ref,
  type RefObject,
} from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import type { FlashListRef } from '@shopify/flash-list';
import type { DriveItem } from '@smarteverything/domain';
import { isNative } from '../../../design/platform';
import {
  NO_SELECTION,
  moveFocus,
  revealOffset,
  selectAllOf,
  selectOne,
  type FolderSelection,
  type ScrollWindow,
} from './folder-model';

export type FolderKey =
  | 'next'
  | 'previous'
  | 'extendNext'
  | 'extendPrevious'
  | 'forward'
  | 'back'
  | 'extendForward'
  | 'extendBack'
  | 'first'
  | 'last'
  | 'open'
  | 'selectAll'
  | 'trash'
  | 'rename'
  | 'details'
  | 'quickLook'
  | 'filter'
  | 'clear';

export interface FolderKeyPress {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
}

const PLAIN: Readonly<Record<string, FolderKey>> = {
  ArrowDown: 'next',
  ArrowUp: 'previous',
  ArrowRight: 'forward',
  ArrowLeft: 'back',
  Home: 'first',
  End: 'last',
  Enter: 'open',
  Delete: 'trash',
  F2: 'rename',
  i: 'details',
  I: 'details',
  ' ': 'quickLook',
  '/': 'filter',
  Escape: 'clear',
};

const SHIFTED: Readonly<Record<string, FolderKey>> = {
  ArrowDown: 'extendNext',
  ArrowUp: 'extendPrevious',
  ArrowRight: 'extendForward',
  ArrowLeft: 'extendBack',
};

function chordKey(press: FolderKeyPress, editable: boolean): FolderKey | null {
  if (editable || press.altKey) return null;
  return press.key.toLowerCase() === 'a' ? 'selectAll' : null;
}

export function folderKeyFor(press: FolderKeyPress, editable: boolean): FolderKey | null {
  if (press.ctrlKey || press.metaKey) return chordKey(press, editable);
  if (press.altKey) return null;
  if (editable) return press.key === 'Escape' ? 'clear' : null;
  return (press.shiftKey ? SHIFTED[press.key] : PLAIN[press.key]) ?? null;
}

export interface KeyHint {
  readonly keys: string;
  readonly action: string;
}

export function keyHintsOf(slots: {
  readonly quickLook: boolean;
  readonly details: boolean;
  readonly writable: boolean;
}): readonly KeyHint[] {
  return [
    ...(slots.quickLook ? [{ keys: 'Space', action: 'quick look' }] : []),
    ...(slots.details ? [{ keys: 'I', action: 'details' }] : []),
    ...(slots.writable ? [{ keys: 'F2', action: 'rename' }] : []),
    { keys: '/', action: 'filter' },
  ];
}

export function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function useFolderKeys(run: (key: FolderKey) => boolean, enabled: boolean): void {
  const handle = useEffectEvent(run);
  useEffect(() => {
    if (!enabled || isNative()) return undefined;
    const listen = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) return;
      const key = folderKeyFor(event, isEditable(event.target));
      if (key !== null && handle(key)) event.preventDefault();
    };
    globalThis.addEventListener('keydown', listen);
    return (): void => {
      globalThis.removeEventListener('keydown', listen);
    };
  }, [enabled]);
}

export function useShiftHeld(): () => boolean {
  const held = useRef(false);
  useEffect(() => {
    if (isNative()) return undefined;
    const track = (event: KeyboardEvent): void => {
      held.current = event.shiftKey;
    };
    const release = (): void => {
      held.current = false;
    };
    globalThis.addEventListener('keydown', track);
    globalThis.addEventListener('keyup', track);
    globalThis.addEventListener('blur', release);
    return (): void => {
      globalThis.removeEventListener('keydown', track);
      globalThis.removeEventListener('keyup', track);
      globalThis.removeEventListener('blur', release);
    };
  }, []);
  return () => held.current;
}

export interface KeyTargets {
  readonly order: readonly string[];
  readonly grid: boolean;
  readonly columns: () => number;
  readonly focused: DriveItem | null;
  readonly picked: readonly DriveItem[];
  readonly writable: boolean;
  readonly select: (change: (current: FolderSelection) => FolderSelection) => void;
  readonly open: (item: DriveItem) => void;
  readonly trash: (items: readonly DriveItem[]) => void;
  readonly rename: (item: DriveItem) => void;
  readonly toggleDetails: (() => void) | null;
  readonly toggleQuickLook: (() => void) | null;
  readonly focusFilter: () => void;
}

export type KeyCommands = Partial<Record<FolderKey, () => void>>;

function steps(targets: KeyTargets): KeyCommands {
  const { order, select, grid, columns } = targets;
  const step =
    (by: 1 | -1, across: boolean, extend: boolean): (() => void) =>
    (): void => {
      const size = across ? 1 : columns();
      select((current) => moveFocus(current, order, by * size, extend));
    };
  return {
    next: step(1, false, false),
    previous: step(-1, false, false),
    extendNext: step(1, false, true),
    extendPrevious: step(-1, false, true),
    ...(grid
      ? {
          forward: step(1, true, false),
          back: step(-1, true, false),
          extendForward: step(1, true, true),
          extendBack: step(-1, true, true),
        }
      : {}),
  };
}

function movement(targets: KeyTargets): KeyCommands {
  const { order, select } = targets;
  const jump =
    (id: string | undefined): (() => void) =>
    (): void => {
      if (id !== undefined) select(() => selectOne(id));
    };
  return {
    ...steps(targets),
    first: jump(order[0]),
    last: jump(order.at(-1)),
    selectAll: (): void => {
      select(() => selectAllOf(order));
    },
    clear: (): void => {
      select(() => NO_SELECTION);
    },
  };
}

function optional(key: FolderKey, run: (() => void) | null): KeyCommands {
  return run === null ? {} : { [key]: run };
}

function onFocused(targets: KeyTargets): KeyCommands {
  const { focused, picked, writable } = targets;
  if (focused === null) return {};
  return {
    open: (): void => {
      targets.open(focused);
    },
    ...(writable
      ? {
          rename: (): void => {
            targets.rename(focused);
          },
        }
      : {}),
    ...(writable && picked.length > 0
      ? {
          trash: (): void => {
            targets.trash(picked);
          },
        }
      : {}),
    ...optional('quickLook', targets.toggleQuickLook),
  };
}

export function keyCommandsOf(targets: KeyTargets): KeyCommands {
  return {
    ...movement(targets),
    ...onFocused(targets),
    ...optional('details', targets.toggleDetails),
    filter: targets.focusFilter,
  };
}

export function toggleOf(
  present: boolean,
  open: boolean,
  set: (open: boolean) => void,
): (() => void) | null {
  if (!present) return null;
  return (): void => {
    set(!open);
  };
}

export function useFolderKeyCommands(targets: KeyTargets, enabled: boolean): void {
  const commands = keyCommandsOf(targets);
  useFolderKeys((key) => {
    const command = commands[key];
    command?.();
    return command !== undefined;
  }, enabled);
}

export interface FolderReveal {
  readonly reveal: (index: number) => void;
  readonly columns: () => number;
}

export const ENTRY_ROW_HEIGHT = 56;

export function useRevealer<T>(
  ref: Ref<FolderReveal> | undefined,
  list: RefObject<FlashListRef<T> | null>,
  columns: number,
  rowHeight: number,
): (event: NativeSyntheticEvent<NativeScrollEvent>) => void {
  const position = useRef<ScrollWindow>({ offset: 0, viewport: 0 });
  useImperativeHandle(ref, () => ({
    reveal: (index): void => {
      const row = Math.floor(index / columns);
      const offset = revealOffset(row, rowHeight, position.current);
      if (offset !== null) list.current?.scrollToOffset({ offset, animated: false });
    },
    columns: (): number => columns,
  }));
  return (event): void => {
    position.current = {
      offset: event.nativeEvent.contentOffset.y,
      viewport: event.nativeEvent.layoutMeasurement.height,
    };
  };
}

export interface BrowserKeyPanels {
  readonly details: boolean;
  readonly quickLook: boolean;
  readonly setDetails: (open: boolean) => void;
  readonly setQuickLook: (open: boolean) => void;
  readonly setRenaming: (item: DriveItem | null) => void;
}

export interface BrowserKeyInput {
  readonly order: readonly string[];
  readonly grid: boolean;
  readonly focused: DriveItem | null;
  readonly picked: readonly DriveItem[];
  readonly writable: boolean;
  readonly selection: FolderSelection;
  readonly setSelection: (change: (current: FolderSelection) => FolderSelection) => void;
  readonly reveal: RefObject<FolderReveal | null>;
  readonly panels: BrowserKeyPanels;
  readonly open: (item: DriveItem) => void;
  readonly trash: (items: readonly DriveItem[]) => void;
  readonly focusFilter: () => void;
  readonly slots: {
    readonly details: boolean;
    readonly quickLook: boolean;
  };
}

export function useBrowserKeys(input: BrowserKeyInput, enabled: boolean): void {
  const { panels, order, slots } = input;
  useFolderKeyCommands(
    {
      order,
      grid: input.grid,
      columns: () => input.reveal.current?.columns() ?? 1,
      focused: input.focused,
      picked: input.picked,
      writable: input.writable,
      select: (change) => {
        const next = change(input.selection);
        input.setSelection(() => next);
        const index = next.focus === null ? -1 : order.indexOf(next.focus);
        if (index !== -1) input.reveal.current?.reveal(index);
      },
      open: input.open,
      trash: input.trash,
      rename: panels.setRenaming,
      toggleDetails: toggleOf(slots.details, panels.details, panels.setDetails),
      toggleQuickLook: toggleOf(slots.quickLook, panels.quickLook, panels.setQuickLook),
      focusFilter: input.focusFilter,
    },
    enabled,
  );
}
