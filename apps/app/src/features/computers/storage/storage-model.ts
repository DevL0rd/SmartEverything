import { formatBytes, type DiskSnapshot } from '@smarteverything/domain';
import { decimal } from '../../../format/number';
import { joinParts } from '../../../format/text';

export interface DiskFacts {
  readonly mount: string;
  readonly device: string;
  readonly label: string | null;
  readonly filesystem: string;
  readonly usedBytes: number;
  readonly totalBytes: number;
  readonly temperature: number | null;
}

export function diskFactsOf(disks: readonly DiskSnapshot[]): readonly DiskFacts[] {
  return disks.map((disk) => ({
    mount: disk.mount,
    device: disk.device,
    label: disk.label,
    filesystem: disk.filesystem,
    usedBytes: disk.usedBytes,
    totalBytes: disk.totalBytes,
    temperature: disk.temperature === null ? null : Math.round(disk.temperature),
  }));
}

export function diskTitle(disk: DiskFacts): string {
  return disk.label ?? disk.mount;
}

export function diskLine(disk: DiskFacts): string {
  return joinParts([
    disk.label === null ? null : disk.mount,
    disk.filesystem,
    disk.device,
    disk.temperature === null ? null : `${decimal(disk.temperature)} °C`,
  ]);
}

export function usedShare(disk: Pick<DiskFacts, 'usedBytes' | 'totalBytes'>): number {
  return disk.totalBytes === 0 ? 0 : (disk.usedBytes / disk.totalBytes) * 100;
}

export function usageLine(disk: Pick<DiskFacts, 'usedBytes' | 'totalBytes'>): string {
  return `${formatBytes(disk.usedBytes)} of ${formatBytes(disk.totalBytes)}`;
}

export function freeLine(disk: Pick<DiskFacts, 'usedBytes' | 'totalBytes'>): string {
  return `${formatBytes(Math.max(0, disk.totalBytes - disk.usedBytes))} free`;
}
