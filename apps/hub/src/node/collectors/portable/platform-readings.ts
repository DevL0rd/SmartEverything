import type { Battery, InterfaceSnapshot } from '@smarteverything/domain';

export interface PlatformIdentity {
  readonly osName: string;
  readonly vendor: string | null;
  readonly product: string | null;
  readonly portable: boolean;
}

export interface MemoryReading {
  readonly totalBytes: number;
  readonly availableBytes: number;
  readonly freeBytes: number;
  readonly cachedBytes: number;
  readonly swapUsedBytes: number;
  readonly swapTotalBytes: number;
}

export interface DiskReading {
  readonly mount: string;
  readonly device: string;
  readonly label: string | null;
  readonly filesystem: string;
  readonly usedBytes: number;
  readonly totalBytes: number;
  readonly readRate: number;
  readonly writeRate: number;
}

export interface InterfaceReading {
  readonly name: string;
  readonly kind: InterfaceSnapshot['kind'];
  readonly state: InterfaceSnapshot['state'];
  readonly speedMbps: number | null;
  readonly receivedBytes: number;
  readonly sentBytes: number;
}

export interface PlatformReadings {
  readonly identity: () => Promise<PlatformIdentity>;
  readonly memory: () => Promise<MemoryReading>;
  readonly disks: () => Promise<readonly DiskReading[]>;
  readonly interfaces: () => Promise<readonly InterfaceReading[]>;
  readonly battery: () => Promise<Battery | null>;
  readonly processCount: () => Promise<number>;
  readonly stop: () => void;
}
