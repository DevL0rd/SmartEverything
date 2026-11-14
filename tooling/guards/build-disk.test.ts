import { describe, expect, it } from 'vitest';
import {
  BUILD_HEADROOM,
  MEASURED_GROWTH,
  ROOT_DISK_RESERVE_BYTES,
  diskLocations,
  diskProblems,
  requireBuildDisk,
  requiredBytes,
  type DiskProbe,
} from '../build-disk.ts';
import { BuildHostError } from '../build-host.ts';

const GIB = 1024 ** 3;
const DATA = '/srv/storage/SmartEverything';
const CHECKOUT = '/srv/storage/checkout';
const HOME = '/home/devl0rd';

function probe(
  devices: Readonly<Record<string, number>>,
  free: Readonly<Record<number, number>>,
): DiskProbe {
  const deviceOf = (path: string): number => {
    const found = Object.entries(devices).find(([prefix]) => path.startsWith(prefix));
    if (found === undefined) throw new Error(`no device for ${path}`);
    return found[1];
  };
  return {
    device: deviceOf,
    freeBytes: (path) => free[deviceOf(path)] ?? 0,
  };
}

const DEVICES = { '/srv/storage': 2, '/home': 1, '/': 1 };

function problems(
  need: Parameters<typeof requiredBytes>[0],
  free: Record<number, number>,
): readonly string[] {
  return diskProblems(
    diskLocations({ root: DATA }, CHECKOUT, need, HOME),
    probe(DEVICES, free),
    DATA,
    CHECKOUT,
  );
}

describe('the free space a build needs', () => {
  it('is the growth measured on 2026-11-14 plus headroom', () => {
    expect(MEASURED_GROWTH.app.data).toBe(4.25 * GIB);
    expect(MEASURED_GROWTH.app.checkout).toBe(2.6 * GIB);
    expect(requiredBytes('app').data).toBe(Math.ceil(4.25 * GIB * BUILD_HEADROOM));
    expect(requiredBytes('app').checkout).toBe(Math.ceil(2.6 * GIB * BUILD_HEADROOM));
    expect(requiredBytes('ui').data).toBeLessThan(requiredBytes('app').data);
  });

  it('refuses an Android build that would not fit on the data disk', () => {
    const found = problems('app', { 1: 100 * GIB, 2: 5 * GIB });
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('the data folder');
    expect(found[0]).toContain('5120 MiB free');
    expect(found[0]).toContain(
      `${String(Math.ceil((requiredBytes('app').data + requiredBytes('app').checkout) / 1048576))} MiB`,
    );
  });

  it('accepts the same build when the data disk has room', () => {
    expect(problems('app', { 1: 6.4 * GIB, 2: 5.5 * 1024 * GIB })).toEqual([]);
  });

  it('keeps the system disk reserve free even for a build that writes elsewhere', () => {
    const found = problems('ui', { 1: 2 * GIB, 2: 100 * GIB });
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('the system disk');
    expect(found[0]).toContain(`${String(ROOT_DISK_RESERVE_BYTES / 1048576)} MiB`);
  });

  it('adds what a build writes to the system disk to its reserve when they share a disk', () => {
    const shared = probe({ '/': 1 }, { 1: 7 * GIB });
    const found = diskProblems(
      diskLocations({ root: DATA }, CHECKOUT, 'app', HOME),
      shared,
      DATA,
      CHECKOUT,
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toContain(
      'the data folder, the update checkout, the home folder, the system disk',
    );
  });

  it('refuses a checkout that is not on the data disk and names the move tool', () => {
    const split = diskProblems(
      diskLocations({ root: DATA }, '/home/devl0rd/Github/SmartEverything', 'ui', HOME),
      probe(DEVICES, { 1: 100 * GIB, 2: 100 * GIB }),
      DATA,
      '/home/devl0rd/Github/SmartEverything',
    );
    expect(split[0]).toContain('tooling/move-update-checkout.ts');
  });

  it('raises the build host error with every problem', () => {
    expect(() => {
      requireBuildDisk({ root: DATA }, CHECKOUT, 'app', {
        probe: probe(DEVICES, { 1: 0, 2: 0 }),
        home: HOME,
      });
    }).toThrow(BuildHostError);
  });
});
