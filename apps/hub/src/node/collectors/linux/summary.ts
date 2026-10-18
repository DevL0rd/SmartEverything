import type { Battery, ComputerSummary, GpuSnapshot, PowerPart } from '@smarteverything/domain';
import { percent, rate, watts } from '../rounding';
import type { FullestDisk } from './disks';
import type { MemoryUse } from './memory';

const UPTIME_STEP_SECONDS = 10;

export interface SummaryInputs {
  readonly cpuLoad: number;
  readonly cpuTemperature: number | null;
  readonly cpuWatts: number | null;
  readonly memory: MemoryUse;
  readonly gpus: readonly GpuSnapshot[];
  readonly download: number;
  readonly upload: number;
  readonly fullestDisk: FullestDisk | null;
  readonly battery: Battery | null;
  readonly processCount: number;
  readonly uptimeSeconds: number;
}

function known(values: readonly (number | null)[]): number[] {
  return values.flatMap((value) => (value === null ? [] : [value]));
}

function busiestGpu(gpus: readonly GpuSnapshot[]): GpuSnapshot | null {
  return gpus.reduce<GpuSnapshot | null>(
    (best, gpu) => (best === null || gpu.load > best.load ? gpu : best),
    null,
  );
}

function gpuWattsOf(gpus: readonly GpuSnapshot[]): number | null {
  const draws = known(gpus.map((gpu) => gpu.powerWatts));
  return draws.length === 0 ? null : watts(draws.reduce((sum, value) => sum + value, 0));
}

export function totalWattsOf(
  cpuWatts: number | null,
  gpuWatts: number | null,
  battery: Battery | null,
): number | null {
  if (battery?.state === 'discharging' && battery.drawWatts !== null) {
    return battery.drawWatts;
  }
  const draws = known([cpuWatts, gpuWatts]);
  return draws.length === 0 ? null : watts(draws.reduce((sum, value) => sum + value, 0));
}

export function powerPartOf(
  cpuWatts: number | null,
  gpus: readonly GpuSnapshot[],
  battery: Battery | null,
): PowerPart {
  return {
    totalWatts: totalWattsOf(cpuWatts, gpuWattsOf(gpus), battery),
    batteryWatts: battery?.drawWatts ?? null,
  };
}

export function summaryOf(inputs: SummaryInputs): ComputerSummary {
  const gpu = busiestGpu(inputs.gpus);
  const gpuWatts = gpuWattsOf(inputs.gpus);
  return {
    cpuLoad: percent(inputs.cpuLoad),
    cpuTemperature: inputs.cpuTemperature,
    memoryPercent: inputs.memory.memoryPercent,
    swapPercent: inputs.memory.swapPercent,
    gpuLoad: gpu?.load ?? null,
    gpuTemperature: gpu?.temperature ?? null,
    gpuMemoryPercent:
      gpu === null || gpu.memoryTotalBytes === 0
        ? null
        : percent((gpu.memoryUsedBytes / gpu.memoryTotalBytes) * 100),
    cpuWatts: inputs.cpuWatts,
    gpuWatts,
    downloadRate: rate(inputs.download),
    uploadRate: rate(inputs.upload),
    fullestDisk: inputs.fullestDisk,
    batteryLevel: inputs.battery?.level ?? null,
    charging: inputs.battery === null ? null : inputs.battery.state === 'charging',
    totalWatts: totalWattsOf(inputs.cpuWatts, gpuWatts, inputs.battery),
    processCount: inputs.processCount,
    uptimeSeconds: Math.floor(inputs.uptimeSeconds / UPTIME_STEP_SECONDS) * UPTIME_STEP_SECONDS,
  };
}
