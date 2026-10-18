import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppState } from 'react-native';
import type * as ExternalStore from '../design/external-store';
import type * as DeferredAction from './deferred-action';
import type * as ToastStore from './toast-store';

vi.mock('../design/external-store', async (original) => ({
  ...(await original<typeof ExternalStore>()),
  useValue: <T>(store: { get: () => T }): T => store.get(),
}));

async function fresh(): Promise<typeof DeferredAction & { readonly toasts: typeof ToastStore }> {
  vi.resetModules();
  const deferred = await import('./deferred-action');
  const toasts = await import('./toast-store');
  toasts.setToastCapacity(10);
  return { ...deferred, toasts };
}

function action(commit: () => Promise<void> | void): DeferredAction.DeferredAction {
  return { key: 'chat:1', message: 'Chat deleted', failure: 'Could not delete the chat', commit };
}

describe('deferred action', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hides the item at once and commits only after the eight second undo window', async () => {
    const { deferAction, usePendingKeys } = await fresh();
    const commit = vi.fn();
    deferAction(action(commit));
    expect(usePendingKeys().has('chat:1')).toBe(true);
    await vi.advanceTimersByTimeAsync(7999);
    expect(commit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('brings the item back and never commits when Undo is used', async () => {
    const { deferAction, usePendingKeys, toasts } = await fresh();
    const commit = vi.fn();
    deferAction(action(commit));
    expect(toasts.undoLatestToast()).toBe(true);
    expect(usePendingKeys().has('chat:1')).toBe(false);
    await vi.advanceTimersByTimeAsync(20000);
    expect(commit).not.toHaveBeenCalled();
  });

  it('ignores a second request for an item already waiting', async () => {
    const { deferAction } = await fresh();
    const commit = vi.fn();
    deferAction(action(commit));
    deferAction(action(commit));
    await vi.advanceTimersByTimeAsync(9000);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('lets the same item be deferred again once its commit has finished', async () => {
    const { deferAction, usePendingKeys } = await fresh();
    const commit = vi.fn();
    deferAction(action(commit));
    await vi.advanceTimersByTimeAsync(9000);
    expect(usePendingKeys().has('chat:1')).toBe(false);
    deferAction(action(commit));
    await vi.advanceTimersByTimeAsync(9000);
    expect(commit).toHaveBeenCalledTimes(2);
  });

  it('commits at once when the app goes to the background', async () => {
    const listen = vi.spyOn(AppState, 'addEventListener');
    const { deferAction } = await fresh();
    const commit = vi.fn();
    deferAction(action(commit));
    const [, onChange] = listen.mock.calls[0] ?? [];
    onChange?.('background');
    await vi.advanceTimersByTimeAsync(0);
    expect(commit).toHaveBeenCalledTimes(1);
    listen.mockRestore();
  });

  it('shows the item again and reports the failure when the commit fails', async () => {
    const { deferAction, usePendingKeys, toasts } = await fresh();
    deferAction(
      action(() => {
        throw new Error('hub refused');
      }),
    );
    await vi.advanceTimersByTimeAsync(9000);
    expect(usePendingKeys().has('chat:1')).toBe(false);
    expect(
      toasts.useShownToasts().some((toast) => toast.message === 'Could not delete the chat'),
    ).toBe(true);
  });
});
