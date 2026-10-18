import type {
  Battery,
  DisksPart,
  InterfaceSnapshot,
  MemoryPart,
  NetworkPart,
} from '@smarteverything/domain';
import type { NetworkInterfaceInfo } from 'node:os';
import { percent, rate } from '../rounding';
import { CounterRates } from './counter-rates';
import type { DiskReading, InterfaceReading, MemoryReading } from './platform-readings';

export interface MemoryUse {
  readonly memoryPercent: number;
  readonly swapPercent: number | null;
}

export function memoryPartOf(reading: MemoryReading): MemoryPart {
  return {
    usedBytes: Math.max(0, reading.totalBytes - reading.availableBytes),
    totalBytes: reading.totalBytes,
    availableBytes: reading.availableBytes,
    cachedBytes: reading.cachedBytes,
    buffersBytes: 0,
    freeBytes: reading.freeBytes,
    swapUsedBytes: reading.swapUsedBytes,
    swapTotalBytes: reading.swapTotalBytes,
    swapInRate: 0,
    swapOutRate: 0,
  };
}

export function memoryUseOf(part: MemoryPart): MemoryUse {
  return {
    memoryPercent: part.totalBytes === 0 ? 0 : percent((part.usedBytes / part.totalBytes) * 100),
    swapPercent:
      part.swapTotalBytes === 0 ? null : percent((part.swapUsedBytes / part.swapTotalBytes) * 100),
  };
}

export function disksPartOf(readings: readonly DiskReading[]): DisksPart {
  return {
    disks: readings.map((disk) => ({
      mount: disk.mount,
      device: disk.device,
      label: disk.label,
      filesystem: disk.filesystem,
      usedBytes: disk.usedBytes,
      totalBytes: disk.totalBytes,
      readRate: rate(disk.readRate),
      writeRate: rate(disk.writeRate),
      temperature: null,
    })),
  };
}

export function fullestDiskOf(
  part: DisksPart,
): { readonly mount: string; readonly percent: number } | null {
  const fullest = part.disks
    .filter((disk) => disk.totalBytes > 0)
    .map((disk) => ({
      mount: disk.mount,
      percent: percent((disk.usedBytes / disk.totalBytes) * 100),
    }))
    .sort((a, b) => b.percent - a.percent)[0];
  return fullest ?? null;
}

export class NetworkRates {
  private readonly rates = new CounterRates();

  part(
    readings: readonly InterfaceReading[],
    addresses: Readonly<Record<string, readonly NetworkInterfaceInfo[] | undefined>>,
    at: number,
  ): NetworkPart {
    this.rates.forgetExcept(
      new Set(readings.flatMap((item) => [`${item.name}:rx`, `${item.name}:tx`])),
    );
    const interfaces = readings.map((item): InterfaceSnapshot => ({
      name: item.name,
      kind: item.kind,
      state: item.state,
      speedMbps: item.speedMbps,
      signalPercent: null,
      addresses: (addresses[item.name] ?? []).map((address) => address.address),
      downloadRate: rate(this.rates.rate(`${item.name}:rx`, item.receivedBytes, at)),
      uploadRate: rate(this.rates.rate(`${item.name}:tx`, item.sentBytes, at)),
    }));
    return {
      downloadRate: rate(interfaces.reduce((sum, item) => sum + item.downloadRate, 0)),
      uploadRate: rate(interfaces.reduce((sum, item) => sum + item.uploadRate, 0)),
      interfaces,
    };
  }
}

export function chargingOf(battery: Battery | null): boolean | null {
  return battery === null ? null : battery.state === 'charging';
}
