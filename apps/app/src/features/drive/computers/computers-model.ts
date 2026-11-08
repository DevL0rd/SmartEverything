import type {
  DiskSnapshot,
  DriveConflict,
  DrivePlacement,
  DriveSyncClient,
} from '@smarteverything/domain';
import type { StatusTone } from '../../../components/tone';
import { compareText, joinParts, plural } from '../../../format/text';
import { moment } from '../../../format/time';
import type { Device } from '../../../store/state';
import { computerGlyph, isHub, osOf } from '../../computers/data/computer-device';
import { diskSeverity } from '../../computers/model/computer-view';
import { usageLine, usedShare } from '../../computers/storage/storage-model';
import { placementWordsOf, type PlacementWords } from '../placements/placement-status';
import { computerRowsOf } from '../roots/computers-strip';

export interface SyncLine {
  readonly text: string;
  readonly tone: StatusTone | null;
}

export interface HomeUsage {
  readonly mount: string;
  readonly line: string;
  readonly share: number;
  readonly tone: 'warning' | 'critical' | null;
}

const NOT_SYNCING: SyncLine = { text: 'Not syncing', tone: null };
const NOT_MOUNTED: SyncLine = { text: 'Not set up', tone: null };

const TONE_RANK: Readonly<Record<StatusTone, number>> = {
  critical: 4,
  warning: 3,
  info: 2,
  positive: 1,
};
const NOW_WORD = 'Now';

export function computersOf(devices: readonly Device[]): readonly Device[] {
  return devices
    .filter((device) => device.kind === 'computer' && !isHub(device))
    .slice()
    .sort((a, b) => Number(b.online) - Number(a.online) || compareText(a.label, b.label));
}

export function syncLineOf(
  device: Device,
  clients: readonly DriveSyncClient[],
  conflicts: readonly DriveConflict[],
): SyncLine {
  const own = clients.filter((client) => client.deviceId === device.id && client.enabled);
  const known = {
    deviceId: device.id,
    name: device.label,
    online: device.online,
    glyph: computerGlyph(device),
  };
  const row = computerRowsOf(own, conflicts, new Map([[device.id, known]]))[0];
  if (row === undefined) return NOT_SYNCING;
  return { text: joinParts([plural(own.length, 'folder'), row.sentence]), tone: row.tone };
}

export function osLineOf(device: Device): string {
  return osOf(device) ?? 'Computer';
}

export function seenTextOf(online: boolean, seenAt: string | null, now: number): string | null {
  if (online) return NOW_WORD;
  return seenAt === null ? null : moment(seenAt, now);
}

export function filesLineOf(allowed: boolean | undefined): string | null {
  if (allowed === undefined) return null;
  return allowed ? 'You can browse its files' : 'Files are turned off on this computer';
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

function rankOf(words: PlacementWords): number {
  return words.tone === null ? 0 : TONE_RANK[words.tone];
}

export function mountLineOf(deviceId: string, placements: readonly DrivePlacement[]): SyncLine {
  const words = placements
    .filter((placement) => placement.deviceId === deviceId && placement.mode === 'mounted')
    .map((placement) => placementWordsOf(placement, 0));
  const worst = words.reduce<PlacementWords | null>(
    (best, next) => (best === null || rankOf(next) > rankOf(best) ? next : best),
    null,
  );
  if (worst === null) return NOT_MOUNTED;
  const line = joinParts([worst.line, worst.notes[0] ?? null]);
  return {
    text: words.length === 1 ? line : joinParts([plural(words.length, 'folder'), line]),
    tone: worst.tone,
  };
}
