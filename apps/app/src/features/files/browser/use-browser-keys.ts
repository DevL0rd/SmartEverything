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
import { isNative } from '../../../design/platform';
import type { FileNode } from '../source/types';
import {
  browserKeyFor,
  isEditable,
  keyCommandsOf,
  toggleOf,
  type BrowserKey,
  type KeyTargets,
} from './keys-model';
import { revealOffset, type FileSelection, type ScrollWindow } from './selection-model';

export function useKeyListener(run: (key: BrowserKey) => boolean, enabled: boolean): void {
  const handle = useEffectEvent(run);
  useEffect(() => {
    if (!enabled || isNative()) return undefined;
    const listen = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) return;
      const key = browserKeyFor(event, isEditable(event.target));
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

export function useKeyCommands<O>(targets: KeyTargets<O>, enabled: boolean): void {
  const commands = keyCommandsOf(targets);
  useKeyListener((key) => {
    const command = commands[key];
    command?.();
    return command !== undefined;
  }, enabled);
}

export interface BrowserReveal {
  readonly reveal: (index: number) => void;
  readonly columns: () => number;
}

export const ENTRY_ROW_HEIGHT = 56;

export function useRevealer<T>(
  ref: Ref<BrowserReveal> | undefined,
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

export interface BrowserKeyPanels<O> {
  readonly details: boolean;
  readonly quickLook: boolean;
  readonly setDetails: (open: boolean) => void;
  readonly setQuickLook: (open: boolean) => void;
  readonly setRenaming: ((node: FileNode<O> | null) => void) | null;
}

export interface BrowserKeyInput<O> {
  readonly order: readonly string[];
  readonly grid: boolean;
  readonly focused: FileNode<O> | null;
  readonly picked: readonly FileNode<O>[];
  readonly selection: FileSelection;
  readonly setSelection: (change: (current: FileSelection) => FileSelection) => void;
  readonly reveal: RefObject<BrowserReveal | null>;
  readonly panels: BrowserKeyPanels<O>;
  readonly open: (node: FileNode<O>) => void;
  readonly trash: ((nodes: readonly FileNode<O>[]) => void) | null;
  readonly focusFilter: () => void;
  readonly slots: {
    readonly details: boolean;
    readonly quickLook: boolean;
  };
}

export function useBrowserKeys<O>(input: BrowserKeyInput<O>, enabled: boolean): void {
  const { panels, order, slots } = input;
  useKeyCommands(
    {
      order,
      grid: input.grid,
      columns: () => input.reveal.current?.columns() ?? 1,
      focused: input.focused,
      picked: input.picked,
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
