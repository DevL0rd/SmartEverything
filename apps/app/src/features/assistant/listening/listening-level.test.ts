import { afterEach, describe, expect, it } from 'vitest';
import { levelStore, receiveLevel } from './listening-level';

afterEach(() => {
  levelStore.set(null);
});

describe('level readings', () => {
  it('ignores a level when no source is watched', () => {
    receiveLevel('cam', -30);
    expect(levelStore.get()).toBeNull();
  });

  it('ignores a level from a source the sheet is not showing', () => {
    levelStore.set({ sourceKey: 'cam', dbfs: -120 });
    receiveLevel('other', -30);
    expect(levelStore.get()).toEqual({ sourceKey: 'cam', dbfs: -120 });
  });

  it('keeps the watched source level in whole decibels', () => {
    levelStore.set({ sourceKey: 'cam', dbfs: -120 });
    receiveLevel('cam', -30.4);
    expect(levelStore.get()).toEqual({ sourceKey: 'cam', dbfs: -30 });
  });

  it('does not wake listeners when the rounded level is unchanged', () => {
    levelStore.set({ sourceKey: 'cam', dbfs: -30 });
    let wakes = 0;
    const off = levelStore.subscribe(() => {
      wakes += 1;
    });
    receiveLevel('cam', -30.2);
    off();
    expect(wakes).toBe(0);
  });
});
