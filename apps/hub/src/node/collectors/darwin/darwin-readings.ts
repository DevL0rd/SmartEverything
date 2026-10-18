import type { Battery } from '@smarteverything/domain';
import { networkInterfaces } from 'node:os';
import type { RunProgram } from '../../run-program';
import type {
  DiskReading,
  InterfaceReading,
  MemoryReading,
  PlatformIdentity,
  PlatformReadings,
} from '../portable/platform-readings';
import {
  parseDf,
  parseHardwarePorts,
  parseMountTypes,
  parseNetstat,
  parsePmset,
  parseSwapUsage,
  parseVmStat,
  volumeRows,
} from './darwin-parse';

export class DarwinReadings implements PlatformReadings {
  constructor(private readonly run: RunProgram) {}

  async identity(): Promise<PlatformIdentity> {
    const [name, version, model] = await Promise.all([
      this.run('sw_vers', ['-productName']),
      this.run('sw_vers', ['-productVersion']),
      this.run('sysctl', ['-n', 'hw.model']),
    ]);
    return {
      osName: `${name.trim()} ${version.trim()}`,
      vendor: 'Apple',
      product: model.trim(),
      portable: model.trim().startsWith('MacBook'),
    };
  }

  async memory(): Promise<MemoryReading> {
    const [total, vm, swap] = await Promise.all([
      this.run('sysctl', ['-n', 'hw.memsize']),
      this.run('vm_stat', []),
      this.run('sysctl', ['-n', 'vm.swapusage']),
    ]);
    const pages = parseVmStat(vm);
    const usage = parseSwapUsage(swap);
    return {
      totalBytes: Number(total),
      availableBytes:
        (pages.freePages + pages.inactivePages + pages.speculativePages + pages.purgeablePages) *
        pages.pageBytes,
      freeBytes: pages.freePages * pages.pageBytes,
      cachedBytes: pages.cachedPages * pages.pageBytes,
      swapTotalBytes: usage.totalBytes,
      swapUsedBytes: usage.usedBytes,
    };
  }

  async disks(): Promise<readonly DiskReading[]> {
    const [df, mounts] = await Promise.all([this.run('df', ['-k']), this.run('mount', [])]);
    const types = parseMountTypes(mounts);
    return volumeRows(parseDf(df)).map((row) => ({
      mount: row.mount,
      device: row.device,
      label: row.mount === '/' ? 'Macintosh HD' : (row.mount.split('/').at(-1) ?? null),
      filesystem: types.get(row.device) ?? 'unknown',
      usedBytes: Math.max(0, row.totalBytes - row.availableBytes),
      totalBytes: row.totalBytes,
      readRate: 0,
      writeRate: 0,
    }));
  }

  async interfaces(): Promise<readonly InterfaceReading[]> {
    const [netstat, ports] = await Promise.all([
      this.run('netstat', ['-ibn']),
      this.run('networksetup', ['-listallhardwareports']),
    ]);
    const kinds = parseHardwarePorts(ports);
    const addresses = networkInterfaces();
    return parseNetstat(netstat).map((counter) => ({
      name: counter.name,
      kind: kinds.get(counter.name) ?? 'other',
      state: (addresses[counter.name] ?? []).some((address) => !address.internal) ? 'up' : 'down',
      speedMbps: null,
      receivedBytes: counter.receivedBytes,
      sentBytes: counter.sentBytes,
    }));
  }

  async battery(): Promise<Battery | null> {
    return parsePmset(await this.run('pmset', ['-g', 'batt']));
  }

  async processCount(): Promise<number> {
    const listing = await this.run('ps', ['-A', '-o', 'pid=']);
    return listing.split('\n').filter((line) => line.trim() !== '').length;
  }

  stop(): void {
    return undefined;
  }
}
