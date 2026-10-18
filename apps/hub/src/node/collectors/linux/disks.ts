import { perSecond, type DiskSnapshot, type DisksPart } from '@smarteverything/domain';
import { existsSync, readdirSync, readFileSync, realpathSync, statfsSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { bytesOf, celsius, orNull, percent, rate } from '../rounding';
import { PerTick, type ReadFailed, type Tick } from '../tick';
import type { KernelFiles } from './kernel-file';
import { Rescan } from './rescan';

const SECTOR_BYTES = 512;
const SPACE_INTERVAL_MS = 10_000;
const LABEL_ROOT = '/dev/disk/by-label';
const HWMON_ROOT = '/sys/class/hwmon';

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
  readonly filesystem: string;
  readonly label: string | null;
  readonly temperaturePath: string | null;
}

interface Transfer {
  readonly read: number;
  readonly written: number;
  readonly at: number;
}

interface Space {
  readonly usedBytes: number;
  readonly totalBytes: number;
}

type Rates = Pick<DiskSnapshot, 'readRate' | 'writeRate'>;

export interface FullestDisk {
  readonly mount: string;
  readonly percent: number;
}

function unescaped(field: string): string {
  return field.replace(/\\(\d{3})/g, (_, octal: string) => String.fromCharCode(parseInt(octal, 8)));
}

function labelledDevices(): Map<string, string> {
  if (!existsSync(LABEL_ROOT)) {
    return new Map();
  }
  return new Map(
    readdirSync(LABEL_ROOT).map((name) => [
      realpathSync(`${LABEL_ROOT}/${name}`),
      name.replace(/\\x([0-9a-f]{2})/gi, (_, hex: string) =>
        String.fromCharCode(parseInt(hex, 16)),
      ),
    ]),
  );
}

function parentDisk(block: string): string {
  const real = realpathSync(`/sys/class/block/${block}`);
  return existsSync(`${real}/partition`) ? basename(dirname(real)) : block;
}

function temperaturePathOf(block: string): string | null {
  const device = `/sys/block/${parentDisk(block)}/device`;
  if (!existsSync(device)) {
    return null;
  }
  const hwmon = readdirSync(device).find((name) => name.startsWith('hwmon'));
  return hwmon === undefined ? null : `${HWMON_ROOT}/${hwmon}/temp1_input`;
}

function mountsOf(text: string): Mount[] {
  const seen = new Set<string>();
  const labels = labelledDevices();
  return text.split('\n').flatMap((line) => {
    const [device = '', mount = '', type = ''] = line.split(' ');
    if (!device.startsWith('/dev/') || !REAL_FILESYSTEMS.has(type) || seen.has(device)) {
      return [];
    }
    seen.add(device);
    const real = realpathSync(device);
    const block = basename(real);
    return [
      {
        mount: unescaped(mount),
        device,
        block,
        filesystem: type,
        label: labels.get(real) ?? null,
        temperaturePath: temperaturePathOf(block),
      },
    ];
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

function ratesOf(current: Transfer | undefined, previous: Transfer | undefined): Rates {
  if (current === undefined || previous === undefined) {
    return { readRate: 0, writeRate: 0 };
  }
  const seconds = (current.at - previous.at) / 1000;
  return {
    readRate: rate(perSecond(current.read, previous.read, seconds)),
    writeRate: rate(perSecond(current.written, previous.written, seconds)),
  };
}

export class DiskCollector {
  private readonly mounts = new Rescan(() => mountsOf(readFileSync('/proc/self/mounts', 'utf8')));
  private readonly rates = new PerTick<Map<string, Rates>>();
  private before = new Map<string, Transfer>();
  private space = new Map<string, Space>();
  private spaceAt: number | null = null;

  constructor(
    private readonly files: KernelFiles,
    private readonly failed: ReadFailed,
    private readonly temperatureAt: (tick: Tick, path: string) => number | null,
  ) {}

  part(tick: Tick): DisksPart {
    const rates = this.ratesOf(tick);
    const space = this.spaceOf(tick.at);
    const disks = this.mounts.current(tick.at).flatMap((mount): DiskSnapshot[] => {
      const used = space.get(mount.mount);
      if (used === undefined) {
        return [];
      }
      const temperature =
        mount.temperaturePath === null ? null : this.temperatureAt(tick, mount.temperaturePath);
      return [
        {
          mount: mount.mount,
          device: mount.device,
          label: mount.label,
          filesystem: mount.filesystem,
          usedBytes: bytesOf(used.usedBytes, used.totalBytes),
          totalBytes: used.totalBytes,
          ...(rates.get(mount.block) ?? { readRate: 0, writeRate: 0 }),
          temperature: orNull(temperature, celsius),
        },
      ];
    });
    return { disks };
  }

  fullest(tick: Tick): FullestDisk | null {
    const space = this.spaceOf(tick.at);
    let fullest: FullestDisk | null = null;
    for (const [mount, used] of space) {
      const share = used.totalBytes === 0 ? 0 : percent((used.usedBytes / used.totalBytes) * 100);
      if (fullest === null || share > fullest.percent) {
        fullest = { mount, percent: share };
      }
    }
    return fullest;
  }

  private ratesOf(tick: Tick): Map<string, Rates> {
    return this.rates.get(tick, () => {
      const now = transfersOf(this.files.read('/proc/diskstats'), tick.at);
      const before = this.before;
      this.before = now;
      return new Map(
        [...now].map(([block, transfer]) => [block, ratesOf(transfer, before.get(block))]),
      );
    });
  }

  private spaceOf(at: number): Map<string, Space> {
    if (this.spaceAt === null || at - this.spaceAt >= SPACE_INTERVAL_MS) {
      this.spaceAt = at;
      this.space = this.readSpace(at);
    }
    return this.space;
  }

  private readSpace(at: number): Map<string, Space> {
    const space = new Map<string, Space>();
    for (const mount of this.mounts.current(at)) {
      try {
        const stat = statfsSync(mount.mount);
        space.set(mount.mount, {
          usedBytes: (stat.blocks - stat.bfree) * stat.bsize,
          totalBytes: stat.blocks * stat.bsize,
        });
      } catch (cause) {
        this.mounts.invalidate();
        this.failed(`disk space of ${mount.mount}`, cause);
      }
    }
    return space;
  }
}
