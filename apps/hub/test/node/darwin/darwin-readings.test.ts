import { describe, expect, it } from 'vitest';
import { DarwinReadings } from '../../../src/node/collectors/darwin/darwin-readings';
import { fakeRun } from '../fake-run';

const VM_STAT = `Mach Virtual Memory Statistics: (page size of 4096 bytes)
Pages free: 1000.
Pages inactive: 2000.
Pages speculative: 300.
Pages purgeable: 400.
File-backed pages: 5000.
`;

describe('reading a Mac through its own programs', () => {
  it('names the system, model and whether it is a laptop', async () => {
    const { run } = fakeRun({
      'sw_vers -productName': 'macOS\n',
      'sw_vers -productVersion': '14.4.1\n',
      'sysctl -n hw.model': 'MacBookPro18,3\n',
    });
    expect(await new DarwinReadings(run).identity()).toStrictEqual({
      osName: 'macOS 14.4.1',
      vendor: 'Apple',
      product: 'MacBookPro18,3',
      portable: true,
    });
  });

  it('calls a Mac mini a desktop', async () => {
    const { run } = fakeRun({
      'sw_vers -productName': 'macOS',
      'sw_vers -productVersion': '15.0',
      'sysctl -n hw.model': 'Mac14,12',
    });
    expect((await new DarwinReadings(run).identity()).portable).toBe(false);
  });

  it('counts free, inactive, speculative and purgeable pages as available memory', async () => {
    const { run } = fakeRun({
      'sysctl -n hw.memsize': '17179869184\n',
      vm_stat: VM_STAT,
      'sysctl -n vm.swapusage': 'total = 1024.00M  used = 512.00M  free = 512.00M  (encrypted)',
    });
    expect(await new DarwinReadings(run).memory()).toStrictEqual({
      totalBytes: 17179869184,
      availableBytes: (1000 + 2000 + 300 + 400) * 4096,
      freeBytes: 1000 * 4096,
      cachedBytes: 5000 * 4096,
      swapTotalBytes: 1024 * 1048576,
      swapUsedBytes: 512 * 1048576,
    });
  });

  it('counts the running programs', async () => {
    const { run } = fakeRun({ 'ps -A -o pid=': '  1\n  2\n  345\n' });
    await expect(new DarwinReadings(run).processCount()).resolves.toBe(3);
  });

  it('reads the battery through pmset', async () => {
    const { run } = fakeRun({
      'pmset -g batt': ' -InternalBattery-0 (id=1)\t50%; discharging; 2:00 remaining present: true',
    });
    expect((await new DarwinReadings(run).battery())?.minutesLeft).toBe(120);
  });

  it('lists drives with the used space of the container and the file system type', async () => {
    const { run } = fakeRun({
      'df -k':
        'Filesystem 1024-blocks Used Available Capacity iused ifree %iused Mounted on\n/dev/disk3s5 1000 600 400 60% 1 2 0% /System/Volumes/Data\n',
      mount: '/dev/disk3s5 on /System/Volumes/Data (apfs, local, journaled)\n',
    });
    expect(await new DarwinReadings(run).disks()).toStrictEqual([
      {
        mount: '/',
        device: '/dev/disk3s5',
        label: 'Macintosh HD',
        filesystem: 'apfs',
        usedBytes: 600 * 1024,
        totalBytes: 1000 * 1024,
        readRate: 0,
        writeRate: 0,
      },
    ]);
  });
});
