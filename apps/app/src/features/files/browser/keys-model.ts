import { nodeAllows } from '../source/ops';
import type { FileNode } from '../source/types';
import {
  NO_SELECTION,
  moveFocus,
  selectAllOf,
  selectOne,
  type FileSelection,
} from './selection-model';

export type BrowserKey =
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

export interface KeyPress {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
}

const PLAIN: Readonly<Record<string, BrowserKey>> = {
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

const SHIFTED: Readonly<Record<string, BrowserKey>> = {
  ArrowDown: 'extendNext',
  ArrowUp: 'extendPrevious',
  ArrowRight: 'extendForward',
  ArrowLeft: 'extendBack',
};

function chordKey(press: KeyPress, editable: boolean): BrowserKey | null {
  if (editable || press.altKey) return null;
  return press.key.toLowerCase() === 'a' ? 'selectAll' : null;
}

export function browserKeyFor(press: KeyPress, editable: boolean): BrowserKey | null {
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
  readonly rename: boolean;
}): readonly KeyHint[] {
  return [
    ...(slots.quickLook ? [{ keys: 'Space', action: 'quick look' }] : []),
    ...(slots.details ? [{ keys: 'I', action: 'details' }] : []),
    ...(slots.rename ? [{ keys: 'F2', action: 'rename' }] : []),
    { keys: '/', action: 'filter' },
  ];
}

export function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export interface KeyTargets<O = unknown> {
  readonly order: readonly string[];
  readonly grid: boolean;
  readonly columns: () => number;
  readonly focused: FileNode<O> | null;
  readonly picked: readonly FileNode<O>[];
  readonly select: (change: (current: FileSelection) => FileSelection) => void;
  readonly open: (node: FileNode<O>) => void;
  readonly trash: ((nodes: readonly FileNode<O>[]) => void) | null;
  readonly rename: ((node: FileNode<O>) => void) | null;
  readonly toggleDetails: (() => void) | null;
  readonly toggleQuickLook: (() => void) | null;
  readonly focusFilter: () => void;
}

export type KeyCommands = Partial<Record<BrowserKey, () => void>>;

function steps<O>(targets: KeyTargets<O>): KeyCommands {
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

function movement<O>(targets: KeyTargets<O>): KeyCommands {
  const { order, select } = targets;
  const jump =
    (key: string | undefined): (() => void) =>
    (): void => {
      if (key !== undefined) select(() => selectOne(key));
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

function optional(key: BrowserKey, run: (() => void) | null): KeyCommands {
  return run === null ? {} : { [key]: run };
}

function renameOf<O>(targets: KeyTargets<O>, focused: FileNode<O>): (() => void) | null {
  const { rename } = targets;
  if (rename === null || !nodeAllows('rename', focused)) return null;
  return (): void => {
    rename(focused);
  };
}

function trashOf<O>(targets: KeyTargets<O>): (() => void) | null {
  const { trash, picked } = targets;
  if (trash === null || picked.length === 0) return null;
  if (!picked.every((node) => nodeAllows('trash', node))) return null;
  return (): void => {
    trash(picked);
  };
}

function onFocused<O>(targets: KeyTargets<O>): KeyCommands {
  const { focused } = targets;
  if (focused === null) return {};
  return {
    open: (): void => {
      targets.open(focused);
    },
    ...optional('rename', renameOf(targets, focused)),
    ...optional('trash', trashOf(targets)),
    ...optional('quickLook', targets.toggleQuickLook),
  };
}

export function keyCommandsOf<O>(targets: KeyTargets<O>): KeyCommands {
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
