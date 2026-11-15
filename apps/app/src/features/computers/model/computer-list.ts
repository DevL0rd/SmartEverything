import type { DiskSnapshot } from '@smarteverything/domain';
import { compareText } from '../../../format/text';
import type { Device } from '../../../store/state';
import { isHub, osOf } from '../data/computer-device';
import { usageLine, usedShare } from '../storage/storage-model';
import { diskSeverity } from './computer-view';

export interface HomeUsage {
  readonly mount: string;
  readonly line: string;
  readonly share: number;
  readonly tone: 'warning' | 'critical' | null;
}

export function computersOf(
  devices: readonly Device[],
  thisComputer: string | null = null,
): readonly Device[] {
  return devices
    .filter((device) => device.kind === 'computer' && !isHub(device))
    .slice()
    .sort(
      (a, b) =>
        Number(b.id === thisComputer) - Number(a.id === thisComputer) ||
        Number(b.online) - Number(a.online) ||
        compareText(a.label, b.label),
    );
}

export function osLineOf(device: Device): string {
  return osOf(device) ?? 'Computer';
}

function folded(path: string): string {
  const slashed = path.replaceAll('\\', '/');
  return /^[a-z]:/i.test(slashed) ? slashed.toLowerCase() : slashed;
}

function holds(mount: string, home: string): boolean {
  const base = folded(mount).replace(/\/+$/, '');
  const inside = folded(home);
  return base === '' || inside === base || inside.startsWith(`${base}/`);
}

export function homeDiskOf(disks: readonly DiskSnapshot[], home: string): DiskSnapshot | null {
  return disks
    .filter((disk) => holds(disk.mount, home))
    .reduce<DiskSnapshot | null>(
      (best, disk) => (best === null || disk.mount.length > best.mount.length ? disk : best),
      null,
    );
}

export function homeUsageOf(disks: readonly DiskSnapshot[], home: string): HomeUsage | null {
  const disk = homeDiskOf(disks, home);
  if (disk === null) return null;
  const share = usedShare(disk);
  return {
    mount: disk.mount,
    line: usageLine(disk),
    share: share / 100,
    tone: diskSeverity(share).tone,
  };
}
