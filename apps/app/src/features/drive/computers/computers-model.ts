import type { DiskSnapshot } from '@smarteverything/domain';
import { compareText, joinParts, plural } from '../../../format/text';
import { moment } from '../../../format/time';
import type { Device } from '../../../store/state';
import { isHub, osOf } from '../../computers/data/computer-device';
import { diskSeverity } from '../../computers/model/computer-view';
import { usageLine, usedShare } from '../../computers/storage/storage-model';

export interface HomeUsage {
  readonly mount: string;
  readonly line: string;
  readonly share: number;
  readonly tone: 'warning' | 'critical' | null;
}

const NOW_WORD = 'Now';

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

export function seenTextOf(online: boolean, seenAt: string | null, now: number): string | null {
  if (online) return NOW_WORD;
  return seenAt === null ? null : moment(seenAt, now);
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

function offlinePartOf(offline: readonly Device[]): string {
  const [only, second] = offline;
  if (only === undefined) return 'all online';
  return second === undefined ? `${only.label} offline` : `${String(offline.length)} offline`;
}

export function computersSubtitleOf(computers: readonly Device[]): string | undefined {
  if (computers.length === 0) return undefined;
  return joinParts([
    plural(computers.length, 'computer'),
    offlinePartOf(computers.filter((device) => !device.online)),
  ]);
}
