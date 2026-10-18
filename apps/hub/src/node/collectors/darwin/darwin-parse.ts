import type { Battery } from '@smarteverything/domain';
import type { InterfaceReading } from '../portable/platform-readings';

const KIB = 1024;
const MIB = KIB * KIB;
const MINUTES_PER_HOUR = 60;
const VIRTUAL_INTERFACES = /^(lo|utun|awdl|llw|bridge|gif|stf|ap|anpi|ipsec|pktap|vmenet|vnic)\d*/u;
const DATA_VOLUME = '/System/Volumes/Data';
const SYSTEM_VOLUME_PREFIX = '/System/Volumes/';

export interface VmStatistics {
  readonly pageBytes: number;
  readonly freePages: number;
  readonly inactivePages: number;
  readonly speculativePages: number;
  readonly purgeablePages: number;
  readonly cachedPages: number;
}

function pagesOf(text: string, label: string): number {
  const match = new RegExp(`^${label}:\\s+(\\d+)\\.?$`, 'mu').exec(text);
  return Number(match?.[1] ?? 0);
}

export function parseVmStat(text: string): VmStatistics {
  const size = /page size of (\d+) bytes/u.exec(text)?.[1];
  return {
    pageBytes: Number(size ?? 4096),
    freePages: pagesOf(text, 'Pages free'),
    inactivePages: pagesOf(text, 'Pages inactive'),
    speculativePages: pagesOf(text, 'Pages speculative'),
    purgeablePages: pagesOf(text, 'Pages purgeable'),
    cachedPages: pagesOf(text, 'File-backed pages'),
  };
}

export interface SwapUsage {
  readonly totalBytes: number;
  readonly usedBytes: number;
}

function megabytes(text: string, label: string): number {
  const match = new RegExp(`${label} = ([\\d.]+)M`, 'u').exec(text);
  return Math.round(Number(match?.[1] ?? 0) * MIB);
}

export function parseSwapUsage(text: string): SwapUsage {
  return { totalBytes: megabytes(text, 'total'), usedBytes: megabytes(text, 'used') };
}

export interface DfRow {
  readonly device: string;
  readonly totalBytes: number;
  readonly availableBytes: number;
  readonly mount: string;
}

const DF_ROW = /^(\S+)\s+(\d+)\s+\d+\s+(\d+)\s+\d+%\s+\d+\s+\d+\s+\d+%\s+(.+)$/u;

export function parseDf(text: string): readonly DfRow[] {
  return text.split('\n').flatMap((line): DfRow[] => {
    const match = DF_ROW.exec(line.trim());
    const [, device, blocks, available, mount] = match ?? [];
    if (
      device === undefined ||
      blocks === undefined ||
      available === undefined ||
      mount === undefined
    ) {
      return [];
    }
    return [
      { device, totalBytes: Number(blocks) * KIB, availableBytes: Number(available) * KIB, mount },
    ];
  });
}

export function volumeRows(rows: readonly DfRow[]): readonly DfRow[] {
  return rows
    .filter((row) => row.device.startsWith('/dev/disk'))
    .filter(
      (row) =>
        row.mount === DATA_VOLUME ||
        !(row.mount === '/' || row.mount.startsWith(SYSTEM_VOLUME_PREFIX)),
    )
    .map((row) => (row.mount === DATA_VOLUME ? { ...row, mount: '/' } : row));
}

export function parseMountTypes(text: string): ReadonlyMap<string, string> {
  const types = new Map<string, string>();
  for (const line of text.split('\n')) {
    const match = /^(\S+) on .+ \(([^,)]+)/u.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) types.set(match[1], match[2]);
  }
  return types;
}

export interface Counters {
  readonly name: string;
  readonly receivedBytes: number;
  readonly sentBytes: number;
}

export function parseNetstat(text: string): readonly Counters[] {
  const seen = new Set<string>();
  const counters: Counters[] = [];
  for (const line of text.split('\n')) {
    const fields = line.trim().split(/\s+/u);
    const [name, , network] = fields;
    if (network?.startsWith('<Link#') !== true || name === undefined) continue;
    if (seen.has(name) || VIRTUAL_INTERFACES.test(name)) continue;
    const received = Number(fields.at(-5));
    const sent = Number(fields.at(-2));
    if (!Number.isFinite(received) || !Number.isFinite(sent)) continue;
    seen.add(name);
    counters.push({ name, receivedBytes: received, sentBytes: sent });
  }
  return counters;
}

export function parseHardwarePorts(text: string): ReadonlyMap<string, InterfaceReading['kind']> {
  const kinds = new Map<string, InterfaceReading['kind']>();
  let port = '';
  for (const line of text.split('\n')) {
    const label = /^Hardware Port: (.+)$/u.exec(line)?.[1];
    if (label !== undefined) port = label.toLowerCase();
    const device = /^Device: (\S+)$/u.exec(line)?.[1];
    if (device !== undefined) kinds.set(device, kindOfPort(port));
  }
  return kinds;
}

function kindOfPort(port: string): InterfaceReading['kind'] {
  if (port.includes('wi-fi') || port.includes('airport')) return 'wifi';
  if (port.includes('ethernet') || port.includes('thunderbolt')) return 'ethernet';
  return 'other';
}

const PMSET_STATES: Readonly<Record<string, Battery['state']>> = {
  charging: 'charging',
  'finishing charge': 'charging',
  discharging: 'discharging',
  charged: 'full',
  'ac attached': 'idle',
};

function minutesOf(line: string): number | null {
  const time = /(\d+):(\d+) remaining/u.exec(line);
  return time?.[1] === undefined || time[2] === undefined
    ? null
    : Number(time[1]) * MINUTES_PER_HOUR + Number(time[2]);
}

export function parsePmset(text: string): Battery | null {
  const line = text.split('\n').find((candidate) => candidate.includes('InternalBattery'));
  const level = line === undefined ? undefined : /(\d+)%/u.exec(line)?.[1];
  if (line === undefined || level === undefined) return null;
  const word = /%;\s*([^;]+);/u.exec(line)?.[1]?.trim().toLowerCase() ?? '';
  const state = PMSET_STATES[word] ?? 'unknown';
  return {
    level: Number(level),
    state,
    pluggedIn: state !== 'discharging',
    minutesLeft: state === 'discharging' ? minutesOf(line) : null,
    healthPercent: null,
    drawWatts: null,
  };
}
