import { describe, expect, it } from 'vitest';
import {
  largestApps,
  partsOf,
  storageSpoken,
  summaryParts,
  usedBytes,
  usedShare,
  usedText,
  type StorageSection,
} from './storage-model';

const GB = 1024 ** 3;

function storage(overrides: Partial<StorageSection> = {}): StorageSection {
  return {
    totalBytes: 256 * GB,
    freeBytes: 64 * GB,
    parts: [
      { kind: 'images', bytes: 30 * GB },
      { kind: 'apps', bytes: 80 * GB },
      { kind: 'video', bytes: 0 },
      { kind: 'system', bytes: 20 * GB },
    ],
    apps: [
      { package: 'a', label: 'Small', bytes: 1 * GB },
      { package: 'b', label: 'Big', bytes: 4 * GB },
      { package: 'c', label: '', bytes: 2 * GB },
    ],
    at: '2026-10-18T10:00:00.000Z',
    ...overrides,
  };
}

describe('how full the storage is', () => {
  it('counts used bytes and the share used', () => {
    expect(usedBytes(storage())).toBe(192 * GB);
    expect(usedShare(storage())).toBe(0.75);
    expect(usedText(storage())).toContain('75');
  });

  it('never goes negative and survives an empty total', () => {
    expect(usedBytes(storage({ freeBytes: 300 * GB }))).toBe(0);
    expect(usedShare(storage({ totalBytes: 0, freeBytes: 0 }))).toBe(0);
  });
});

describe('the breakdown', () => {
  it('lists the biggest parts first, skips empty ones and ends with free space', () => {
    const parts = partsOf(storage());
    expect(parts.map((part) => part.key)).toEqual(['apps', 'images', 'system', 'free']);
    expect(parts.at(-1)?.colour).toBeNull();
    expect(parts[0]?.colour).not.toBeNull();
  });

  it('gives each part its own colour', () => {
    const colours = partsOf(storage()).map((part) => part.colour);
    expect(new Set(colours).size).toBe(colours.length);
  });

  it('shows only used and free when the phone cannot break it down', () => {
    expect(summaryParts(storage({ parts: [] })).map((part) => part.key)).toEqual(['used', 'free']);
  });

  it('speaks every part for a screen reader', () => {
    expect(storageSpoken(storage())).toContain('Apps');
    expect(storageSpoken(storage())).toContain('Free');
  });
});

describe('the largest apps', () => {
  it('ranks by size with the share of the biggest and names an unlabelled app by its package', () => {
    const ranked = largestApps(storage());
    expect(ranked.map((entry) => entry.key)).toEqual(['b', 'c', 'a']);
    expect(ranked.map((entry) => entry.share)).toEqual([1, 0.5, 0.25]);
    expect(ranked[1]?.label).toBe('c');
  });

  it('has nothing when the phone reported no apps', () => {
    expect(largestApps(storage({ apps: [] }))).toEqual([]);
  });
});
