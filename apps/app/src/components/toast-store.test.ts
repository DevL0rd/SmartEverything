import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ExternalStore from '../design/external-store';
import type * as ToastStore from './toast-store';

vi.mock('../design/external-store', async (original) => ({
  ...(await original<typeof ExternalStore>()),
  useValue: <T>(store: { get: () => T }): T => store.get(),
}));

async function freshStore(): Promise<typeof ToastStore> {
  vi.resetModules();
  const store = await import('./toast-store');
  store.setToastCapacity(10);
  return store;
}

describe('toast store', () => {
  beforeAll(async () => {
    await import('./toast-store');
  }, 60_000);

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a toast, then lets it leave after four seconds and remove itself', async () => {
    const store = await freshStore();
    store.notify({ message: 'Saved' });
    expect(store.useShownToasts().map((toast) => toast.message)).toEqual(['Saved']);
    vi.advanceTimersByTime(3999);
    expect(store.useShownToasts()[0]?.leaving).toBe(false);
    vi.advanceTimersByTime(1);
    expect(store.useShownToasts()[0]?.leaving).toBe(true);
    vi.advanceTimersByTime(150);
    expect(store.useShownToasts()).toEqual([]);
  });

  it('keeps failures longer than plain notices and undo longest', async () => {
    const store = await freshStore();
    store.notify({ message: 'Failed', tone: 'critical' });
    store.notify({ message: 'Deleted', undo: () => undefined });
    vi.advanceTimersByTime(5999);
    expect(store.useShownToasts().filter((toast) => !toast.leaving)).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(store.useShownToasts().filter((toast) => !toast.leaving)).toHaveLength(1);
    vi.advanceTimersByTime(2000);
    expect(store.useShownToasts().filter((toast) => !toast.leaving)).toHaveLength(0);
  });

  it('counts an identical toast instead of stacking it and restarts its time', async () => {
    const store = await freshStore();
    const first = store.notify({ message: 'Saved' });
    vi.advanceTimersByTime(3000);
    const second = store.notify({ message: 'Saved' });
    expect(second).toBe(first);
    expect(store.useShownToasts()).toHaveLength(1);
    expect(store.useShownToasts()[0]?.count).toBe(2);
    vi.advanceTimersByTime(3000);
    expect(store.useShownToasts()[0]?.leaving).toBe(false);
  });

  it('keeps toasts that differ in detail, tone or error apart', async () => {
    const store = await freshStore();
    store.notify({ message: 'Saved' });
    store.notify({ message: 'Saved', detail: 'twice' });
    store.notify({ message: 'Saved', tone: 'positive' });
    store.notify({ message: 'Saved', error: new Error('x') });
    expect(store.useShownToasts()).toHaveLength(4);
  });

  it('never merges a toast that has an action or undo', async () => {
    const store = await freshStore();
    store.notify({ message: 'Deleted', undo: () => undefined });
    store.notify({ message: 'Deleted', undo: () => undefined });
    store.notify({ message: 'Open', action: { label: 'Open', onPress: () => undefined } });
    store.notify({ message: 'Open', action: { label: 'Open', onPress: () => undefined } });
    expect(store.useShownToasts()).toHaveLength(4);
  });

  it('drops the oldest waiting toast when more than six are queued and tells it', async () => {
    const store = await freshStore();
    store.setToastCapacity(1);
    const dropped: string[] = [];
    for (let index = 0; index < 8; index += 1) {
      store.notify({
        message: `Toast ${String(index)}`,
        onDismissed: () => dropped.push(`Toast ${String(index)}`),
      });
    }
    expect(dropped).toEqual(['Toast 1', 'Toast 2']);
    expect(store.useShownToasts().map((toast) => toast.message)).toEqual(['Toast 0']);
  });

  it('tells the owner when a toast is dismissed but not when its action was used', async () => {
    const store = await freshStore();
    const onDismissed = vi.fn();
    const onPress = vi.fn();
    const plain = store.notify({ message: 'Plain', onDismissed });
    store.dismissToast(plain);
    store.dismissToast(plain);
    expect(onDismissed).toHaveBeenCalledTimes(1);
    store.notify({ message: 'Action', onDismissed, action: { label: 'Go', onPress } });
    const toast = store.useShownToasts().find((entry) => entry.message === 'Action');
    if (toast === undefined) {
      throw new Error('no toast');
    }
    store.actOnToast(toast);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onDismissed).toHaveBeenCalledTimes(1);
  });

  it('undoes the newest toast that can be undone', async () => {
    const store = await freshStore();
    const first = vi.fn();
    const second = vi.fn();
    expect(store.undoLatestToast()).toBe(false);
    store.notify({ message: 'One', undo: first });
    store.notify({ message: 'Two', undo: second });
    expect(store.undoLatestToast()).toBe(true);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    expect(store.undoLatestToast()).toBe(true);
    expect(first).toHaveBeenCalledTimes(1);
  });

  it('holds a toast open while it is touched and lets it go afterwards', async () => {
    const store = await freshStore();
    const id = store.notify({ message: 'Saved' });
    store.holdToast(id, 'hover');
    expect(store.useShownToasts()[0]?.held).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(store.useShownToasts()[0]?.leaving).toBe(false);
    store.releaseToast(id, 'hover');
    expect(store.useShownToasts()[0]?.held).toBe(false);
    vi.advanceTimersByTime(4000);
    expect(store.useShownToasts()[0]?.leaving).toBe(true);
  });

  it('reports a failure with the error through the notifier it returns', async () => {
    const store = await freshStore();
    store.notifyFailure('Could not save')(new Error('disk full'));
    const [toast] = store.useShownToasts();
    expect(toast).toMatchObject({ message: 'Could not save', tone: 'critical' });
    expect(toast?.error).toBeInstanceOf(Error);
  });
});

describe('isUndoChord', () => {
  it('is Z with the modifier alone, outside a text field', async () => {
    const { isUndoChord } = await freshStore();
    const base = { key: 'z', mod: true, shift: false, alt: false, editing: false };
    expect(isUndoChord(base)).toBe(true);
    expect(isUndoChord({ ...base, key: 'Z' })).toBe(true);
    expect(isUndoChord({ ...base, shift: true })).toBe(false);
    expect(isUndoChord({ ...base, alt: true })).toBe(false);
    expect(isUndoChord({ ...base, mod: false })).toBe(false);
    expect(isUndoChord({ ...base, editing: true })).toBe(false);
    expect(isUndoChord({ ...base, key: 'y' })).toBe(false);
  });
});
