import { z } from 'zod';

const MOMENT = z.iso.datetime({ offset: true });
const PERCENT = z.number().min(0).max(100);
const BYTES = z.number().nonnegative();
const RATE = z.number().nonnegative();
const CELSIUS = z.number().min(-60).max(200);

export const CPU_SNAPSHOT = z.strictObject({
  load: PERCENT,
  cores: z.array(PERCENT),
  performanceLoad: PERCENT.nullable(),
  efficiencyLoad: PERCENT.nullable(),
  frequencyGhz: z.number().nonnegative().nullable(),
  maxFrequencyGhz: z.number().positive().nullable(),
  temperature: CELSIUS.nullable(),
  powerWatts: z.number().nonnegative().nullable(),
  powerLimitWatts: z.number().positive().nullable(),
  loadAverage: z.tuple([z.number(), z.number(), z.number()]),
});

export type CpuSnapshot = z.infer<typeof CPU_SNAPSHOT>;

export const MEMORY_SNAPSHOT = z.strictObject({
  usedBytes: BYTES,
  totalBytes: BYTES,
  swapUsedBytes: BYTES,
  swapTotalBytes: BYTES,
});

export type MemorySnapshot = z.infer<typeof MEMORY_SNAPSHOT>;

export const DISK_SNAPSHOT = z.strictObject({
  mount: z.string().min(1),
  device: z.string().min(1),
  usedBytes: BYTES,
  totalBytes: BYTES,
  readRate: RATE,
  writeRate: RATE,
});

export type DiskSnapshot = z.infer<typeof DISK_SNAPSHOT>;

export const INTERFACE_SNAPSHOT = z.strictObject({
  name: z.string().min(1),
  downloadRate: RATE,
  uploadRate: RATE,
});

export type InterfaceSnapshot = z.infer<typeof INTERFACE_SNAPSHOT>;

export const NETWORK_SNAPSHOT = z.strictObject({
  downloadRate: RATE,
  uploadRate: RATE,
  interfaces: z.array(INTERFACE_SNAPSHOT),
});

export type NetworkSnapshot = z.infer<typeof NETWORK_SNAPSHOT>;

export const GPU_VENDORS = ['nvidia', 'amd'] as const;

export const GPU_SNAPSHOT = z.strictObject({
  name: z.string().min(1),
  vendor: z.enum(GPU_VENDORS),
  load: PERCENT,
  memoryUsedBytes: BYTES,
  memoryTotalBytes: BYTES,
  temperature: CELSIUS.nullable(),
  powerWatts: z.number().nonnegative().nullable(),
  powerLimitWatts: z.number().positive().nullable(),
  clockMhz: z.number().nonnegative().nullable(),
  maxClockMhz: z.number().positive().nullable(),
});

export type GpuSnapshot = z.infer<typeof GPU_SNAPSHOT>;

export const FAN_SNAPSHOT = z.strictObject({
  label: z.string().min(1),
  rpm: z.number().nonnegative(),
  maxRpm: z.number().positive().nullable(),
});

export type FanSnapshot = z.infer<typeof FAN_SNAPSHOT>;

export const SENSOR_SNAPSHOT = z.strictObject({
  chip: z.string().min(1),
  label: z.string().min(1),
  celsius: CELSIUS,
});

export type SensorSnapshot = z.infer<typeof SENSOR_SNAPSHOT>;

export const COMPUTER_SNAPSHOT = z.strictObject({
  at: MOMENT,
  uptimeSeconds: z.number().nonnegative(),
  cpu: CPU_SNAPSHOT,
  memory: MEMORY_SNAPSHOT,
  disks: z.array(DISK_SNAPSHOT),
  network: NETWORK_SNAPSHOT,
  gpus: z.array(GPU_SNAPSHOT),
  fans: z.array(FAN_SNAPSHOT),
  sensors: z.array(SENSOR_SNAPSHOT),
});

export type ComputerSnapshot = z.infer<typeof COMPUTER_SNAPSHOT>;
