import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityStore } from '../../../store/entity-store';
import {
  areaBlocked,
  areaStatusOf,
  graceElapsed,
  onGraceElapsed,
  RECONNECT_GRACE_MS,
  type AreaFacts,
} from './area-status';

const LIVE: AreaFacts = { sync: 'live', assistantKnown: true, chatCount: 3, graceElapsed: false };

describe('areaStatusOf', () => {
  it('is live when the connection is live and the assistant status arrived', () => {
    expect(areaStatusOf(LIVE)).toEqual({ kind: 'live' });
  });

  it('is loading before the first assistant status, even when the connection is live', () => {
    expect(areaStatusOf({ ...LIVE, assistantKnown: false })).toEqual({ kind: 'loading' });
    expect(
      areaStatusOf({ ...LIVE, sync: 'connecting', assistantKnown: false, chatCount: 0 }),
    ).toEqual({ kind: 'loading' });
  });

  it('stays reconnecting, not offline, inside the grace window after a drop', () => {
    expect(areaStatusOf({ ...LIVE, sync: 'interrupted' })).toEqual({ kind: 'reconnecting' });
    expect(areaStatusOf({ ...LIVE, sync: 'loading' })).toEqual({ kind: 'reconnecting' });
  });

  it('shows saved chats offline once the grace window passed', () => {
    expect(areaStatusOf({ ...LIVE, sync: 'interrupted', graceElapsed: true })).toEqual({
      kind: 'offline-cached',
    });
  });

  it('is offline-empty when nothing is cached', () => {
    expect(
      areaStatusOf({ ...LIVE, sync: 'interrupted', chatCount: 0, graceElapsed: true }),
    ).toEqual({ kind: 'offline-empty' });
  });

  it('skips the grace window when the hub refused the connection', () => {
    expect(areaStatusOf({ ...LIVE, sync: 'refused' })).toEqual({ kind: 'offline-cached' });
  });

  it('gives up on loading after the grace window when nothing ever arrived', () => {
    expect(
      areaStatusOf({
        sync: 'loading',
        assistantKnown: false,
        chatCount: 0,
        graceElapsed: true,
      }),
    ).toEqual({ kind: 'offline-empty' });
  });

  it('blocks only loading and offline-empty', () => {
    expect(areaBlocked({ kind: 'loading' })).toBe(true);
    expect(areaBlocked({ kind: 'offline-empty' })).toBe(true);
    expect(areaBlocked({ kind: 'offline-cached' })).toBe(false);
    expect(areaBlocked({ kind: 'reconnecting' })).toBe(false);
    expect(areaBlocked({ kind: 'live' })).toBe(false);
  });
});

describe('reconnect grace', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function droppedStore(): EntityStore {
    const store = new EntityStore();
    store.setSync({ status: 'live' });
    store.setSync({ status: 'interrupted' });
    return store;
  }

  it('starts the window when the connection leaves live and keeps it across retries', () => {
    const store = droppedStore();
    const since = store.get().sync.offlineSince;
    expect(since).toBe(1_000_000);
    vi.advanceTimersByTime(1500);
    store.setSync({ status: 'connecting' });
    store.setSync({ status: 'interrupted' });
    expect(store.get().sync.offlineSince).toBe(since);
  });

  it('clears the window when the connection returns and restarts it on the next drop', () => {
    const store = droppedStore();
    store.setSync({ status: 'live' });
    expect(store.get().sync.offlineSince).toBeNull();
    vi.advanceTimersByTime(60_000);
    store.setSync({ status: 'interrupted' });
    expect(store.get().sync.offlineSince).toBe(1_060_000);
  });

  it('lets a consumer mounted long after the drop see the window as elapsed at once', () => {
    const store = droppedStore();
    vi.advanceTimersByTime(10 * 60_000);
    const { offlineSince } = store.get().sync;
    const elapsed = vi.fn();
    onGraceElapsed(offlineSince, Date.now(), elapsed);
    expect(graceElapsed(offlineSince, Date.now())).toBe(true);
    vi.advanceTimersByTime(RECONNECT_GRACE_MS);
    expect(elapsed).not.toHaveBeenCalled();
  });

  it('notifies a consumer mounted inside the window exactly when the window ends', () => {
    const store = droppedStore();
    vi.advanceTimersByTime(1200);
    const { offlineSince } = store.get().sync;
    const elapsed = vi.fn();
    onGraceElapsed(offlineSince, Date.now(), elapsed);
    expect(graceElapsed(offlineSince, Date.now())).toBe(false);
    vi.advanceTimersByTime(RECONNECT_GRACE_MS - 1200 - 1);
    expect(elapsed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(elapsed).toHaveBeenCalledTimes(1);
    expect(graceElapsed(offlineSince, Date.now())).toBe(true);
  });

  it('never notifies when the consumer unsubscribes or the connection is live', () => {
    const store = droppedStore();
    const elapsed = vi.fn();
    const cancel = onGraceElapsed(store.get().sync.offlineSince, Date.now(), elapsed);
    cancel();
    onGraceElapsed(null, Date.now(), elapsed);
    vi.advanceTimersByTime(RECONNECT_GRACE_MS * 2);
    expect(elapsed).not.toHaveBeenCalled();
    expect(graceElapsed(null, Date.now())).toBe(false);
  });
});
