import { LIVE_CHANGE, type LiveChange } from '@smarteverything/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityStore } from './entity-store';

let frames: (() => void)[] = [];

function runFrame(): number {
  const due = frames;
  frames = [];
  for (const callback of due) {
    callback();
  }
  return due.length;
}

function levelChange(seq: number): LiveChange {
  return LIVE_CHANGE.parse({
    type: 'change',
    table: 'device_state',
    operation: 'UPDATE',
    seq,
    record: {
      device_id: '00000000-0000-4000-8000-000000000001',
      capability: 'level',
      value: seq,
      observed_at: new Date(Date.UTC(2026, 9, 16, 0, 0, seq)).toISOString(),
    },
    oldRecord: null,
  });
}

function seqOf(store: EntityStore): number | null {
  return store.get().sync.seq;
}

beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (callback: () => void): number => {
    frames.push(callback);
    return frames.length;
  });
});

describe('EntityStore live notifications', () => {
  it('tells store waiters about every live change at once', () => {
    const store = new EntityStore();
    const seen: (number | null)[] = [];
    store.subscribe(() => seen.push(seqOf(store)));
    for (let seq = 1; seq <= 3; seq += 1) {
      store.apply([levelChange(seq)]);
    }
    expect(seen).toStrictEqual([1, 2, 3]);
  });

  it('renders a burst once on the next frame with the latest state', () => {
    const store = new EntityStore();
    const rendered: (number | null)[] = [];
    store.subscribeRender(() => rendered.push(seqOf(store)));
    for (let seq = 1; seq <= 5; seq += 1) {
      store.apply([levelChange(seq)]);
    }
    expect(rendered).toStrictEqual([]);
    expect(runFrame()).toBe(1);
    expect(rendered).toStrictEqual([5]);
  });

  it('renders a direct update in the same tick and skips the frame it made stale', async () => {
    const store = new EntityStore();
    const rendered: (number | null)[] = [];
    store.subscribeRender(() => rendered.push(seqOf(store)));
    store.apply([levelChange(1)]);
    store.setSync({ status: 'live' });
    expect(rendered).toStrictEqual([]);
    await Promise.resolve();
    expect(rendered).toStrictEqual([1]);
    runFrame();
    expect(rendered).toStrictEqual([1]);
  });

  it('never loses the final update of a long burst', () => {
    const store = new EntityStore();
    const rendered: (number | null)[] = [];
    store.subscribeRender(() => rendered.push(seqOf(store)));
    for (let seq = 1; seq <= 200; seq += 1) {
      store.apply([levelChange(seq)]);
      if (seq % 20 === 0) runFrame();
    }
    runFrame();
    expect(rendered).toHaveLength(10);
    expect(rendered.at(-1)).toBe(200);
  });

  it('does not call a render listener removed before the frame', () => {
    const store = new EntityStore();
    const listener = vi.fn();
    const stop = store.subscribeRender(listener);
    store.apply([levelChange(1)]);
    stop();
    runFrame();
    expect(listener).not.toHaveBeenCalled();
  });

  it('gives a render listener added before the frame the final state', () => {
    const store = new EntityStore();
    store.apply([levelChange(1)]);
    store.apply([levelChange(2)]);
    const rendered: (number | null)[] = [];
    store.subscribeRender(() => rendered.push(seqOf(store)));
    runFrame();
    expect(rendered).toStrictEqual([2]);
  });

  it('commits live changes with no subscribers at all', () => {
    const store = new EntityStore();
    store.apply([levelChange(1)]);
    runFrame();
    expect(seqOf(store)).toBe(1);
  });

  it('wakes a slice subscriber only for its own slices', () => {
    const store = new EntityStore();
    const woken = vi.fn();
    store.subscribeSlices(['tables.ai_chats'], woken);
    store.apply([levelChange(1)]);
    runFrame();
    expect(woken).not.toHaveBeenCalled();
    store.setSync({ status: 'live' });
    store.subscriptions.flush();
    expect(woken).not.toHaveBeenCalled();
  });
});
