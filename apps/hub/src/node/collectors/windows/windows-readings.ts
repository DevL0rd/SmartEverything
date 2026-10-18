import type { Battery } from '@smarteverything/domain';
import { z } from 'zod';
import type {
  DiskReading,
  InterfaceReading,
  MemoryReading,
  PlatformIdentity,
  PlatformReadings,
} from '../portable/platform-readings';
import type { PowerShell } from './powershell-session';
import {
  BATTERY_SCRIPT,
  DISKS_SCRIPT,
  IDENTITY_SCRIPT,
  MEMORY_SCRIPT,
  NETWORK_SCRIPT,
  PROCESS_COUNT_SCRIPT,
} from './windows-scripts';

const PORTABLE_CHASSIS: ReadonlySet<number> = new Set([8, 9, 10, 11, 12, 14, 18, 21, 30, 31, 32]);
const MEGABIT = 1_000_000;
const NO_RUNTIME = 71_582_788;

const IDENTITY = z.object({
  osName: z.string().min(1),
  vendor: z.string(),
  product: z.string(),
  chassis: z.array(z.number()),
  batteries: z.number(),
});

const MEMORY = z.object({
  total: z.number(),
  available: z.number(),
  free: z.number(),
  cached: z.number(),
  swapTotal: z.number(),
  swapFree: z.number(),
});

const DISKS = z.array(
  z.object({
    device: z.string().min(1),
    label: z.string(),
    filesystem: z.string(),
    total: z.number(),
    free: z.number(),
    read: z.number(),
    write: z.number(),
  }),
);

const ADAPTERS = z.array(
  z.object({
    name: z.string().min(1),
    status: z.string(),
    media: z.string(),
    speed: z.number(),
    received: z.number(),
    sent: z.number(),
  }),
);

const BATTERY = z.object({ level: z.number(), status: z.number(), minutes: z.number() }).nullable();

function textOrNull(value: string): string | null {
  return value.trim() === '' ? null : value.trim();
}

export function interfaceKindOf(media: string, name: string): InterfaceReading['kind'] {
  const text = `${media} ${name}`.toLowerCase();
  if (text.includes('802.11') || text.includes('wi-fi') || text.includes('wireless')) return 'wifi';
  if (text.includes('802.3') || text.includes('ethernet')) return 'ethernet';
  return 'other';
}

function stateOf(status: string): InterfaceReading['state'] {
  const text = status.toLowerCase();
  if (text === 'up') return 'up';
  return text === 'disconnected' || text === 'disabled' || text === 'not present'
    ? 'down'
    : 'unknown';
}

const CHARGING = new Set([6, 7, 8, 9]);
const DISCHARGING = new Set([1, 4, 5]);

export function batteryOf(reading: z.infer<typeof BATTERY>): Battery | null {
  if (reading === null) return null;
  const { status } = reading;
  const state = CHARGING.has(status)
    ? 'charging'
    : DISCHARGING.has(status)
      ? 'discharging'
      : status === 3
        ? 'full'
        : status === 2
          ? 'idle'
          : 'unknown';
  return {
    level: Math.min(100, Math.max(0, reading.level)),
    state,
    pluggedIn: state !== 'discharging',
    minutesLeft:
      state === 'discharging' && reading.minutes > 0 && reading.minutes !== NO_RUNTIME
        ? Math.round(reading.minutes)
        : null,
    healthPercent: null,
    drawWatts: null,
  };
}

export class WindowsReadings implements PlatformReadings {
  constructor(private readonly shell: PowerShell) {}

  async identity(): Promise<PlatformIdentity> {
    const found = await this.shell.run(IDENTITY_SCRIPT, IDENTITY);
    return {
      osName: found.osName,
      vendor: textOrNull(found.vendor),
      product: textOrNull(found.product),
      portable: found.chassis.some((type) => PORTABLE_CHASSIS.has(type)) || found.batteries > 0,
    };
  }

  async memory(): Promise<MemoryReading> {
    const found = await this.shell.run(MEMORY_SCRIPT, MEMORY);
    return {
      totalBytes: found.total,
      availableBytes: found.available,
      freeBytes: found.free,
      cachedBytes: found.cached,
      swapTotalBytes: found.swapTotal,
      swapUsedBytes: Math.max(0, found.swapTotal - found.swapFree),
    };
  }

  async disks(): Promise<readonly DiskReading[]> {
    const found = await this.shell.run(DISKS_SCRIPT, DISKS);
    return found.map((disk) => ({
      mount: `${disk.device}\\`,
      device: disk.device,
      label: textOrNull(disk.label),
      filesystem: textOrNull(disk.filesystem) ?? 'unknown',
      usedBytes: Math.max(0, disk.total - disk.free),
      totalBytes: disk.total,
      readRate: disk.read,
      writeRate: disk.write,
    }));
  }

  async interfaces(): Promise<readonly InterfaceReading[]> {
    const found = await this.shell.run(NETWORK_SCRIPT, ADAPTERS);
    return found.map((adapter) => ({
      name: adapter.name,
      kind: interfaceKindOf(adapter.media, adapter.name),
      state: stateOf(adapter.status),
      speedMbps: adapter.speed > 0 ? Math.round(adapter.speed / MEGABIT) : null,
      receivedBytes: adapter.received,
      sentBytes: adapter.sent,
    }));
  }

  async battery(): Promise<Battery | null> {
    return batteryOf(await this.shell.run(BATTERY_SCRIPT, BATTERY));
  }

  processCount(): Promise<number> {
    return this.shell.run(PROCESS_COUNT_SCRIPT, z.number());
  }

  stop(): void {
    this.shell.stop();
  }
}
