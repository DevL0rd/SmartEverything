import type { ComputerSummary, CpuPart, GpuSnapshot } from '@smarteverything/domain';

export const SUMMARY: ComputerSummary = {
  cpuLoad: 12.5,
  cpuTemperature: 55,
  memoryPercent: 40,
  swapPercent: null,
  gpuLoad: null,
  gpuTemperature: null,
  gpuMemoryPercent: null,
  cpuWatts: 10,
  gpuWatts: null,
  downloadRate: 1200,
  uploadRate: 300,
  fullestDisk: { mount: '/', percent: 71.2 },
  batteryLevel: 80,
  charging: false,
  totalWatts: 10,
  processCount: 300,
  uptimeSeconds: 600,
};

export const CPU: CpuPart = {
  load: 12.5,
  cores: [10, 15],
  frequenciesGhz: [3.1, 3.2],
  performanceLoad: null,
  efficiencyLoad: null,
  frequencyGhz: 3.15,
  maxFrequencyGhz: 4.5,
  temperature: 55,
  powerWatts: 10,
  powerLimitWatts: 65,
  loadAverage: [1, 2, 3],
  throttled: null,
};

export const GPU: GpuSnapshot = {
  id: 'nvidia-0',
  name: 'GPU',
  vendor: 'nvidia',
  load: 5,
  memoryUsedBytes: 1000,
  memoryTotalBytes: 8000,
  temperature: 40,
  powerWatts: 20,
  powerLimitWatts: 100,
  clockMhz: 300,
  maxClockMhz: 2000,
  memoryClockMhz: 400,
  fanPercent: null,
  encoderLoad: null,
  decoderLoad: null,
};
