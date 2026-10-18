import { z } from 'zod';

const PERCENT = z.number().min(0).max(100);
const BYTES = z.number().nonnegative();
const RATE = z.number().nonnegative();
const CELSIUS = z.number().min(-60).max(200);
const WATTS = z.number().nonnegative();

export const CORE_KINDS = ['performance', 'efficiency'] as const;

export type CoreKind = (typeof CORE_KINDS)[number];

export const COMPUTER_SUMMARY = z.strictObject({
  cpuLoad: PERCENT,
  cpuTemperature: CELSIUS.nullable(),
  memoryPercent: PERCENT,
  swapPercent: PERCENT.nullable(),
  gpuLoad: PERCENT.nullable(),
  gpuTemperature: CELSIUS.nullable(),
  gpuMemoryPercent: PERCENT.nullable(),
  cpuWatts: WATTS.nullable(),
  gpuWatts: WATTS.nullable(),
  downloadRate: RATE,
  uploadRate: RATE,
  fullestDisk: z.strictObject({ mount: z.string().min(1), percent: PERCENT }).nullable(),
  batteryLevel: PERCENT.nullable(),
  charging: z.boolean().nullable(),
  totalWatts: WATTS.nullable(),
  processCount: z.int().nonnegative(),
  uptimeSeconds: z.number().nonnegative(),
});

export type ComputerSummary = z.infer<typeof COMPUTER_SUMMARY>;

export const CPU_PART = z.strictObject({
  load: PERCENT,
  cores: z.array(PERCENT),
  frequenciesGhz: z.array(z.number().nonnegative()),
  performanceLoad: PERCENT.nullable(),
  efficiencyLoad: PERCENT.nullable(),
  frequencyGhz: z.number().nonnegative().nullable(),
  maxFrequencyGhz: z.number().positive().nullable(),
  temperature: CELSIUS.nullable(),
  powerWatts: WATTS.nullable(),
  powerLimitWatts: z.number().positive().nullable(),
  loadAverage: z.tuple([z.number(), z.number(), z.number()]),
  throttled: z.boolean().nullable(),
});

export type CpuPart = z.infer<typeof CPU_PART>;

export const GPU_VENDORS = ['nvidia', 'amd', 'intel'] as const;

export const GPU_SNAPSHOT = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  vendor: z.enum(GPU_VENDORS),
  load: PERCENT,
  memoryUsedBytes: BYTES,
  memoryTotalBytes: BYTES,
  temperature: CELSIUS.nullable(),
  powerWatts: WATTS.nullable(),
  powerLimitWatts: z.number().positive().nullable(),
  clockMhz: z.number().nonnegative().nullable(),
  maxClockMhz: z.number().positive().nullable(),
  memoryClockMhz: z.number().nonnegative().nullable(),
  fanPercent: PERCENT.nullable(),
  encoderLoad: PERCENT.nullable(),
  decoderLoad: PERCENT.nullable(),
});

export type GpuSnapshot = z.infer<typeof GPU_SNAPSHOT>;

export const GPU_PART = z.strictObject({ gpus: z.array(GPU_SNAPSHOT) });

export type GpuPart = z.infer<typeof GPU_PART>;

export const MEMORY_PART = z.strictObject({
  usedBytes: BYTES,
  totalBytes: BYTES,
  availableBytes: BYTES,
  cachedBytes: BYTES,
  buffersBytes: BYTES,
  freeBytes: BYTES,
  swapUsedBytes: BYTES,
  swapTotalBytes: BYTES,
  swapInRate: RATE,
  swapOutRate: RATE,
});

export type MemoryPart = z.infer<typeof MEMORY_PART>;

export const DISK_SNAPSHOT = z.strictObject({
  mount: z.string().min(1),
  device: z.string().min(1),
  label: z.string().min(1).nullable(),
  filesystem: z.string().min(1),
  usedBytes: BYTES,
  totalBytes: BYTES,
  readRate: RATE,
  writeRate: RATE,
  temperature: CELSIUS.nullable(),
});

export type DiskSnapshot = z.infer<typeof DISK_SNAPSHOT>;

export const DISKS_PART = z.strictObject({ disks: z.array(DISK_SNAPSHOT) });

export type DisksPart = z.infer<typeof DISKS_PART>;

export const INTERFACE_KINDS = ['wifi', 'ethernet', 'vpn', 'bridge', 'other'] as const;

export type InterfaceKind = (typeof INTERFACE_KINDS)[number];

export const INTERFACE_STATES = ['up', 'down', 'unknown'] as const;

export const INTERFACE_SNAPSHOT = z.strictObject({
  name: z.string().min(1),
  kind: z.enum(INTERFACE_KINDS),
  state: z.enum(INTERFACE_STATES),
  speedMbps: z.number().positive().nullable(),
  signalPercent: PERCENT.nullable(),
  addresses: z.array(z.string().min(1)),
  downloadRate: RATE,
  uploadRate: RATE,
});

export type InterfaceSnapshot = z.infer<typeof INTERFACE_SNAPSHOT>;

export const NETWORK_PART = z.strictObject({
  downloadRate: RATE,
  uploadRate: RATE,
  interfaces: z.array(INTERFACE_SNAPSHOT),
});

export type NetworkPart = z.infer<typeof NETWORK_PART>;

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
  highCelsius: CELSIUS.nullable(),
  criticalCelsius: CELSIUS.nullable(),
});

export type SensorSnapshot = z.infer<typeof SENSOR_SNAPSHOT>;

export const SENSORS_PART = z.strictObject({
  sensors: z.array(SENSOR_SNAPSHOT),
  fans: z.array(FAN_SNAPSHOT),
});

export type SensorsPart = z.infer<typeof SENSORS_PART>;

export const POWER_PART = z.strictObject({
  totalWatts: WATTS.nullable(),
  batteryWatts: WATTS.nullable(),
});

export type PowerPart = z.infer<typeof POWER_PART>;
