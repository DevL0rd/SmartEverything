import type { DiskSnapshot } from '@smarteverything/domain';
import { basename } from 'node:path';
import { readFileSync, realpathSync, statfsSync } from 'node:fs';
import type { KernelFiles } from './kernel-file';
import { Rescan } from './rescan';

const SECTOR_BYTES = 512;

const REAL_FILESYSTEMS: ReadonlySet<string> = new Set([
  'ext2',
  'ext3',
  'ext4',
  'btrfs',
  'xfs',
  'f2fs',
  'vfat',
  'exfat',
  'ntfs',
  'ntfs3',
  'zfs',
  'bcachefs',
]);

interface Mount {
  readonly mount: string;
  readonly device: string;
  readonly block: string;
}

interface Transfer {
  readonly read: number;
  readonly written: number;
  readonly at: number;
}

function unescaped(field: string): string {
  return field.replace(/\\(\d{3})/g, (_, octal: string) => String.fromCharCode(parseInt(octal, 8)));
}

export function mountsOf(text: string): Mount[] {
  const seen = new Set<string>();
  return text.split('\n').flatMap((line) => {
    const [device = '', mount = '', type = ''] = line.split(' ');
    if (!device.startsWith('/dev/') || !REAL_FILESYSTEMS.has(type) || seen.has(device)) {
      return [];
    }
    seen.add(device);
    return [{ mount: unescaped(mount), device, block: basename(realpathSync(device)) }];
  });
}

function transfersOf(text: string, at: number): Map<string, Transfer> {
  const transfers = new Map<string, Transfer>();
  for (const line of text.split('\n')) {
    const fields = line.trim().split(/\s+/);
    const name = fields[2];
    if (name !== undefined && fields.length >= 10) {
      transfers.set(name, {
        read: Number(fields[5]) * SECTOR_BYTES,
        written: Number(fields[9]) * SECTOR_BYTES,
        at,
      });
    }
  }
  return transfers;
}

function rate(now: number, before: number, seconds: number): number {
  return seconds > 0 && now >= before ? (now - before) / seconds : 0;
}

function ratesOf(
  current: Transfer | undefined,
  previous: Transfer | undefined,
): Pick<DiskSnapshot, 'readRate' | 'writeRate'> {
  if (current === undefined || previous === undefined) {
    return { readRate: 0, writeRate: 0 };
  }
  const seconds = (current.at - previous.at) / 1000;
  return {
    readRate: rate(current.read, previous.read, seconds),
    writeRate: rate(current.written, previous.written, seconds),
  };
}

export class DiskCollector {
  private readonly mounts = new Rescan(() => mountsOf(readFileSync('/proc/self/mounts', 'utf8')));
  private before = new Map<string, Transfer>();

  constructor(private readonly files: KernelFiles) {}

  read(at: number): DiskSnapshot[] {
    const now = transfersOf(this.files.read('/proc/diskstats'), at);
    const before = this.before;
    this.before = now;
    return this.mounts.current(at).map((mount) => {
      const space = statfsSync(mount.mount);
      return {
        mount: mount.mount,
        device: mount.device,
        usedBytes: (space.blocks - space.bfree) * space.bsize,
        totalBytes: space.blocks * space.bsize,
        ...ratesOf(now.get(mount.block), before.get(mount.block)),
      };
    });
  }
}
