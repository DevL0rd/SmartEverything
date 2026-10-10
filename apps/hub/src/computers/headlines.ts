import {
  BYTE_RATE_UNIT,
  type ComputerSnapshot,
  type DeviceCapability,
  type StandardCapability,
} from '@smarteverything/domain';

interface Headline {
  readonly key: StandardCapability;
  readonly label: string;
  readonly unit: string;
  readonly max: number;
  readonly read: (snapshot: ComputerSnapshot) => number | null;
}

export interface HeadlineValue {
  readonly key: StandardCapability;
  readonly value: number;
  readonly rounded: number;
}

const PERCENT = 100;
const CELSIUS_MAX = 150;
const RATE_MAX = 1e12;
const RATE_DIGITS = 3;

function share(used: number, total: number): number | null {
  return total > 0 ? (used / total) * PERCENT : null;
}

function rootDisk(snapshot: ComputerSnapshot): number | null {
  const disk = snapshot.disks.find((item) => item.mount === '/') ?? snapshot.disks[0];
  return disk === undefined ? null : share(disk.usedBytes, disk.totalBytes);
}

const HEADLINES: readonly Headline[] = [
  { key: 'cpu_load', label: 'Processor', unit: '%', max: PERCENT, read: (s) => s.cpu.load },
  {
    key: 'memory_used',
    label: 'Memory',
    unit: '%',
    max: PERCENT,
    read: (s) => share(s.memory.usedBytes, s.memory.totalBytes),
  },
  {
    key: 'gpu_load',
    label: 'Graphics',
    unit: '%',
    max: PERCENT,
    read: (s) => s.gpus[0]?.load ?? null,
  },
  { key: 'disk_used', label: 'Disk', unit: '%', max: PERCENT, read: rootDisk },
  {
    key: 'cpu_temperature',
    label: 'Processor temperature',
    unit: '°C',
    max: CELSIUS_MAX,
    read: (s) => s.cpu.temperature,
  },
  {
    key: 'gpu_temperature',
    label: 'Graphics temperature',
    unit: '°C',
    max: CELSIUS_MAX,
    read: (s) => s.gpus[0]?.temperature ?? null,
  },
  {
    key: 'download_rate',
    label: 'Download',
    unit: BYTE_RATE_UNIT,
    max: RATE_MAX,
    read: (s) => s.network.downloadRate,
  },
  {
    key: 'upload_rate',
    label: 'Upload',
    unit: BYTE_RATE_UNIT,
    max: RATE_MAX,
    read: (s) => s.network.uploadRate,
  },
];

function rounded(headline: Headline, value: number): number {
  return Math.round(
    headline.unit === BYTE_RATE_UNIT ? Number(value.toPrecision(RATE_DIGITS)) : value,
  );
}

export function headlineValues(snapshot: ComputerSnapshot): HeadlineValue[] {
  return HEADLINES.flatMap((headline) => {
    const value = headline.read(snapshot);
    return value === null ? [] : [{ key: headline.key, value, rounded: rounded(headline, value) }];
  });
}

export function headlineCapabilities(snapshot: ComputerSnapshot): DeviceCapability[] {
  return HEADLINES.filter((headline) => headline.read(snapshot) !== null).map((headline) => ({
    key: headline.key,
    label: headline.label,
    access: 'read',
    value: { kind: 'number', min: 0, max: headline.max, step: 1, unit: headline.unit },
  }));
}
