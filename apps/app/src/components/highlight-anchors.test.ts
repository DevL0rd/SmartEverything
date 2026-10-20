import type { RefObject } from 'react';
import type { View } from 'react-native';
import { describe, expect, it } from 'vitest';
import { HighlightRegistry, type AnchorEntry } from './highlight-anchors';

const NEVER = new AbortController().signal;

function entry(key: string): AnchorEntry {
  const ref: RefObject<View | null> = { current: null };
  return { key, label: key, ref, scroll: null };
}

describe('the highlight registry', () => {
  it('shows an anchor that is already on screen', async () => {
    const registry = new HighlightRegistry();
    const lamp = entry('tile:lamp');
    registry.register(lamp);
    await expect(registry.request(['tile:lamp'], NEVER)).resolves.toBe(true);
    expect(registry.shown.get()).toBe(lamp);
  });

  it('waits for an anchor that mounts later and shows it when it registers', async () => {
    const registry = new HighlightRegistry();
    const waiting = registry.request(['setting:wake'], NEVER);
    const row = entry('setting:wake');
    registry.register(row);
    await expect(waiting).resolves.toBe(true);
    expect(registry.shown.get()).toBe(row);
  });

  it('shows the first of several keys that registers', async () => {
    const registry = new HighlightRegistry();
    const waiting = registry.request(['a', 'b'], NEVER);
    registry.register(entry('b'));
    await expect(waiting).resolves.toBe(true);
    expect(registry.shown.get()?.key).toBe('b');
  });

  it('gives up when the signal aborts and shows nothing afterwards', async () => {
    const registry = new HighlightRegistry();
    const deadline = new AbortController();
    const waiting = registry.request(['setting:wake'], deadline.signal);
    deadline.abort();
    await expect(waiting).resolves.toBe(false);
    registry.register(entry('setting:wake'));
    expect(registry.shown.get()).toBeNull();
  });

  it('gives up at once when the signal is already aborted', async () => {
    const registry = new HighlightRegistry();
    const deadline = new AbortController();
    deadline.abort();
    await expect(registry.request(['x'], deadline.signal)).resolves.toBe(false);
  });

  it('settles a waiting request as not shown when a different one replaces it', async () => {
    const registry = new HighlightRegistry();
    const first = registry.request(['a'], NEVER);
    const second = registry.request(['b'], NEVER);
    await expect(first).resolves.toBe(false);
    registry.register(entry('b'));
    await expect(second).resolves.toBe(true);
  });

  it('joins an identical waiting request instead of replacing it', async () => {
    const registry = new HighlightRegistry();
    const first = registry.request(['a'], NEVER);
    const second = registry.request(['a'], NEVER);
    registry.register(entry('a'));
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
  });

  it('keeps showing the same anchor when it is requested again', async () => {
    const registry = new HighlightRegistry();
    const row = entry('a');
    registry.register(row);
    await registry.request(['a'], NEVER);
    await expect(registry.request(['a'], NEVER)).resolves.toBe(true);
    expect(registry.shown.get()).toBe(row);
  });

  it('clears the highlight when the shown anchor unmounts', async () => {
    const registry = new HighlightRegistry();
    const off = registry.register(entry('a'));
    await registry.request(['a'], NEVER);
    off();
    expect(registry.shown.get()).toBeNull();
    expect(registry.present(['a'])).toBe(false);
  });

  it('keeps a newer registration of the same key when an older one unmounts', () => {
    const registry = new HighlightRegistry();
    const offOld = registry.register(entry('a'));
    registry.register(entry('a'));
    offOld();
    expect(registry.present(['a'])).toBe(true);
  });

  it('clears what is shown and settles what is waiting', async () => {
    const registry = new HighlightRegistry();
    registry.register(entry('a'));
    await registry.request(['a'], NEVER);
    const waiting = registry.request(['b'], NEVER);
    registry.clear();
    await expect(waiting).resolves.toBe(false);
    expect(registry.shown.get()).toBeNull();
  });
});
