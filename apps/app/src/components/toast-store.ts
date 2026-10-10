import { ValueStore, useValue } from '../design/external-store';
import { DURATION } from '../design/motion';
import { rawErrorText } from '../format/errors';
import { ToastClock, type ToastHold } from './toast-clock';

export type ToastTone = 'default' | 'positive' | 'critical';

interface ToastAction {
  readonly label: string;
  readonly onPress: () => void;
}

export interface ToastInput {
  readonly message: string;
  readonly detail?: string;
  readonly error?: unknown;
  readonly tone?: ToastTone;
  readonly action?: ToastAction;
  readonly onDismissed?: () => void;
}

export interface Toast extends ToastInput {
  readonly id: number;
  readonly count: number;
  readonly leaving: boolean;
}

interface ToastState {
  readonly items: readonly Toast[];
  readonly capacity: number;
}

const SHOWN_MS = { info: 4000, error: 6000 } as const;

const QUEUE_LIMIT = 6;

const state = new ValueStore<ToastState>({ items: [], capacity: 1 });

const clock = new ToastClock(dismissToast);

let nextId = 1;

function durationOf(toast: ToastInput): number {
  return toast.tone === 'critical' || toast.error !== undefined ? SHOWN_MS.error : SHOWN_MS.info;
}

function sameKey(input: ToastInput): string | null {
  if (input.action !== undefined || input.onDismissed !== undefined) {
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
  change(() => next.filter((entry) => !dropped.includes(entry)));
  for (const entry of dropped) {
    entry.onDismissed?.();
  }
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
    return existing.id;
  }
  const id = nextId;
  nextId += 1;
  enqueue({ ...input, id, count: 1, leaving: false });
  return id;
}

function close(id: number, acted: boolean): void {
  const toast = state.get().items.find((entry) => entry.id === id);
  if (toast === undefined || toast.leaving) {
    return;
  }
  clock.forget(id);
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

export function holdToast(id: number, reason: ToastHold): void {
  clock.hold(id, reason);
}

export function releaseToast(id: number, reason: ToastHold): void {
  clock.release(id, reason);
}

export function setToastCapacity(capacity: number): void {
  state.update((current) => ({ ...current, capacity }));
  startShown();
}

export function useShownToasts(): readonly Toast[] {
  const { items, capacity } = useValue(state);
  return items.slice(0, capacity);
}
