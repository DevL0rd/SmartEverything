import { describe, expect, it } from 'vitest';
import type { DiskSnapshot } from '@smarteverything/domain';
import { diskFactsOf, diskLine, diskTitle, freeLine, usageLine, usedShare } from './storage-model';

const GB = 1_000_000_000;

function snapshot(patch: Partial<DiskSnapshot>): DiskSnapshot {
  return {
    mount: '/',
    device: 'nvme0n1p2',
    label: null,
    filesystem: 'btrfs',
    usedBytes: 250 * GB,
    totalBytes: 500 * GB,
    readRate: 123,
    writeRate: 456,
    temperature: 41.6,
    ...patch,
  };
}

describe('storage model', () => {
  it('drops the live rates and rounds the temperature so a rate tick is not a change', () => {
    const [fast] = diskFactsOf([snapshot({ readRate: 1, writeRate: 2 })]);
    const [slow] = diskFactsOf([snapshot({ readRate: 9_000_000, writeRate: 8_000_000 })]);
    expect(fast).toEqual(slow);
    expect(fast?.temperature).toBe(42);
  });

  it('titles a drive by its label, else its mount', () => {
    const [plain] = diskFactsOf([snapshot({})]);
    const [named] = diskFactsOf([snapshot({ label: 'Games', mount: '/mnt/games' })]);
    expect(plain && diskTitle(plain)).toBe('/');
    expect(named && diskTitle(named)).toBe('Games');
    expect(named && diskLine(named)).toBe('/mnt/games · btrfs · nvme0n1p2 · 42 °C');
  });

  it('shows how full a drive is', () => {
    expect(usedShare({ usedBytes: 250 * GB, totalBytes: 500 * GB })).toBe(50);
    expect(usedShare({ usedBytes: 1, totalBytes: 0 })).toBe(0);
    expect(usageLine({ usedBytes: 250 * GB, totalBytes: 500 * GB })).toBe('250 GB of 500 GB');
    expect(freeLine({ usedBytes: 250 * GB, totalBytes: 500 * GB })).toBe('250 GB free');
    expect(freeLine({ usedBytes: 600 * GB, totalBytes: 500 * GB })).toBe('0 B free');
  });
});
