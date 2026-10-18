import { Logger } from '@smarteverything/logging';
import { ValueStore, useValue } from '../design/external-store';
import { DURATION } from '../design/motion';
import { rawErrorText } from '../format/errors';
import { ToastClock, type ToastHold } from './toast-clock';

const log = new Logger('app.toast');

type ToastTone = 'default' | 'positive' | 'critical';

interface ToastAction {
  readonly label: string;
  readonly onPress: () => void;
}

interface ToastBase {
  readonly message: string;
  readonly detail?: string;
  readonly error?: unknown;
  readonly tone?: ToastTone;
  readonly onDismissed?: () => void;
}

export type ToastInput = ToastBase &
  (
    | { readonly action?: ToastAction; readonly undo?: never }
    | { readonly undo: () => void; readonly action?: never }
  );

export interface Toast extends ToastBase {
  readonly id: number;
  readonly count: number;
  readonly leaving: boolean;
  readonly held: boolean;
  readonly undoable: boolean;
  readonly action?: ToastAction;
}

interface ToastState {
  readonly items: readonly Toast[];
  readonly capacity: number;
}

export const UNDO_MS = 8000;

const SHOWN_MS = { info: 4000, error: 6000, undo: UNDO_MS } as const;

const QUEUE_LIMIT = 6;

const state = new ValueStore<ToastState>({ items: [], capacity: 1 });

const clock = new ToastClock(dismissToast);

let nextId = 1;

function durationOf(toast: Toast): number {
  if (toast.undoable) {
    return SHOWN_MS.undo;
  }
  return toast.tone === 'critical' || toast.error !== undefined ? SHOWN_MS.error : SHOWN_MS.info;
}

function sameKey(input: ToastInput): string | null {
  if (input.action !== undefined || input.undo !== undefined || input.onDismissed !== undefined) {
    return null;
  }
  const error = input.error === undefined ? null : rawErrorText(input.error);
  return JSON.stringify([input.message, input.detail ?? null, input.tone ?? 'default', error]);
}

function sameToast(toast: Toast, key: string | null): boolean {
  return key !== null && !toast.leaving && sameKey(toast) === key;
}

function startShown(): void {
  const { items, capacity } = state.get();
  for (const toast of items.slice(0, capacity)) {
    if (!toast.leaving) {
      clock.show(toast.id, durationOf(toast));
    }
  }
}

function change(update: (items: readonly Toast[]) => readonly Toast[]): void {
  state.update((current) => ({ ...current, items: update(current.items) }));
  startShown();
}

function overflow(items: readonly Toast[], capacity: number): readonly Toast[] {
  return items.length > QUEUE_LIMIT
    ? items.slice(capacity, items.length - QUEUE_LIMIT + capacity)
    : [];
}

function enqueue(toast: Toast): void {
  const { items, capacity } = state.get();
  const next = [...items, toast];
  const dropped = overflow(next, capacity);
  if (dropped.length > 0) {
    log.warn('toast.overflowed', { dropped: dropped.length, queued: next.length, capacity });
  }
  change(() => next.filter((entry) => !dropped.includes(entry)));
  for (const entry of dropped) {
    entry.onDismissed?.();
  }
}

function toastOf(input: ToastInput, id: number): Toast {
  const { undo, ...rest } = input;
  const action = undo === undefined ? {} : { action: { label: 'Undo', onPress: undo } };
  return {
    ...rest,
    ...action,
    id,
    count: 1,
    leaving: false,
    held: false,
    undoable: undo !== undefined,
  };
}

export function notify(input: ToastInput): number {
  const key = sameKey(input);
  const existing = state.get().items.find((toast) => sameToast(toast, key));
  if (existing !== undefined) {
    change((items) =>
      items.map((toast) =>
        toast.id === existing.id ? { ...toast, count: toast.count + 1 } : toast,
      ),
    );
    clock.restart(existing.id, durationOf(existing));
    log.debug('toast.repeated', { id: existing.id, count: existing.count + 1 });
    return existing.id;
  }
  const id = nextId;
  nextId += 1;
  log.info('toast.shown', {
    id,
    tone: input.tone ?? 'default',
    messageLength: input.message.length,
    hasDetail: input.detail !== undefined,
    hasError: input.error !== undefined,
    undoable: input.undo !== undefined,
    queued: state.get().items.length + 1,
  });
  enqueue(toastOf(input, id));
  return id;
}

export function notifyFailure(message: string): (error: unknown) => void {
  return (error) => {
    notify({ message, error, tone: 'critical' });
  };
}

function close(id: number, acted: boolean): void {
  const toast = state.get().items.find((entry) => entry.id === id);
  if (toast === undefined || toast.leaving) {
    return;
  }
  clock.forget(id);
  log.debug('toast.closed', { id, acted, count: toast.count });
  change((items) => items.map((entry) => (entry.id === id ? { ...entry, leaving: true } : entry)));
  setTimeout(() => {
    change((items) => items.filter((entry) => entry.id !== id));
  }, DURATION.short);
  if (!acted) {
    toast.onDismissed?.();
  }
}

export function dismissToast(id: number): void {
  close(id, false);
}

export function actOnToast(toast: Toast): void {
  toast.action?.onPress();
  close(toast.id, true);
}

export function expandToast(toast: Toast): void {
  clock.restart(toast.id, SHOWN_MS.error);
}

function markHeld(id: number): void {
  const held = clock.isHeld(id);
  const toast = state.get().items.find((entry) => entry.id === id);
  if (toast !== undefined && toast.held !== held) {
    state.update((current) => ({
      ...current,
      items: current.items.map((entry) => (entry.id === id ? { ...entry, held } : entry)),
    }));
  }
}

export function holdToast(id: number, reason: ToastHold): void {
  clock.hold(id, reason);
  markHeld(id);
}

export function releaseToast(id: number, reason: ToastHold): void {
  clock.release(id, reason);
  markHeld(id);
}

export function undoLatestToast(): boolean {
  const { items, capacity } = state.get();
  const target = items.slice(0, capacity).findLast((toast) => toast.undoable && !toast.leaving);
  if (target === undefined) {
    return false;
  }
  actOnToast(target);
  return true;
}

export interface UndoChord {
  readonly key: string;
  readonly mod: boolean;
  readonly shift: boolean;
  readonly alt: boolean;
  readonly editing: boolean;
}

export function isUndoChord({ key, mod, shift, alt, editing }: UndoChord): boolean {
  return key.toLowerCase() === 'z' && mod && !shift && !alt && !editing;
}

export function setToastCapacity(capacity: number): void {
  state.update((current) => ({ ...current, capacity }));
  startShown();
}

export function useShownToasts(): readonly Toast[] {
  const { items, capacity } = useValue(state);
  return items.slice(0, capacity);
}
