import type { ComputerParts, ComputerSummary, CpuPart, GpuSnapshot } from '@smarteverything/domain';

export type SeriesReading = readonly [id: string, value: number | null];

const SUMMARY_KEYS = [
  'cpuLoad',
  'cpuTemperature',
  'memoryPercent',
  'swapPercent',
  'gpuLoad',
  'gpuTemperature',
  'gpuMemoryPercent',
  'cpuWatts',
  'gpuWatts',
  'downloadRate',
  'uploadRate',
  'batteryLevel',
  'totalWatts',
  'processCount',
] as const satisfies readonly (keyof ComputerSummary)[];

const CPU_KEYS = [
  'load',
  'performanceLoad',
  'efficiencyLoad',
  'frequencyGhz',
  'temperature',
  'powerWatts',
] as const satisfies readonly (keyof CpuPart)[];

const GPU_KEYS = [
  'load',
  'memoryUsedBytes',
  'temperature',
  'powerWatts',
  'clockMhz',
  'fanPercent',
] as const satisfies readonly (keyof GpuSnapshot)[];

const MEMORY_KEYS = [
  'usedBytes',
  'availableBytes',
  'cachedBytes',
  'swapUsedBytes',
  'swapInRate',
  'swapOutRate',
] as const;

export function seriesId(topic: string, key: string): string {
  return `${topic}/${key}`;
}

function uniqueKeys(keys: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return keys.map((key) => {
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    return count === 1 ? key : `${key}#${String(count)}`;
  });
}

function summaryReadings(summary: ComputerSummary): SeriesReading[] {
  return [
    ...SUMMARY_KEYS.map((key): SeriesReading => [seriesId('summary', key), summary[key]]),
    [seriesId('summary', 'fullestDiskPercent'), summary.fullestDisk?.percent ?? null],
  ];
}

function cpuReadings(part: NonNullable<ComputerParts['cpu']>): SeriesReading[] {
  return [
    ...CPU_KEYS.map((key): SeriesReading => [seriesId('cpu', key), part[key]]),
    ...part.cores.map((load, index): SeriesReading => [
      seriesId('cpu', `core${String(index)}`),
      load,
    ]),
  ];
}

function gpuReadings(gpus: readonly GpuSnapshot[]): SeriesReading[] {
  return gpus.flatMap((gpu) =>
    GPU_KEYS.map((key): SeriesReading => [seriesId('gpu', `${gpu.id}.${key}`), gpu[key]]),
  );
}

function memoryReadings(part: NonNullable<ComputerParts['memory']>): SeriesReading[] {
  return MEMORY_KEYS.map((key): SeriesReading => [seriesId('memory', key), part[key]]);
}

function diskReadings(part: NonNullable<ComputerParts['disks']>): SeriesReading[] {
  return part.disks.flatMap((disk): SeriesReading[] => [
    [seriesId('disks', `${disk.device}.readRate`), disk.readRate],
    [seriesId('disks', `${disk.device}.writeRate`), disk.writeRate],
    [seriesId('disks', `${disk.device}.temperature`), disk.temperature],
  ]);
}

function networkReadings(part: NonNullable<ComputerParts['network']>): SeriesReading[] {
  return [
    [seriesId('network', 'downloadRate'), part.downloadRate],
    [seriesId('network', 'uploadRate'), part.uploadRate],
    ...part.interfaces.flatMap((adapter): SeriesReading[] => [
      [seriesId('network', `${adapter.name}.downloadRate`), adapter.downloadRate],
      [seriesId('network', `${adapter.name}.uploadRate`), adapter.uploadRate],
      [seriesId('network', `${adapter.name}.signalPercent`), adapter.signalPercent],
    ]),
  ];
}

function sensorReadings(part: NonNullable<ComputerParts['sensors']>): SeriesReading[] {
  const sensorKeys = uniqueKeys(part.sensors.map((sensor) => `${sensor.chip}.${sensor.label}`));
  const fanKeys = uniqueKeys(part.fans.map((fan) => `fan.${fan.label}`));
  return [
    ...part.sensors.map((sensor, index): SeriesReading => [
      seriesId('sensors', sensorKeys[index] ?? sensor.label),
      sensor.celsius,
    ]),
    ...part.fans.map((fan, index): SeriesReading => [
      seriesId('sensors', fanKeys[index] ?? fan.label),
      fan.rpm,
    ]),
  ];
}

function powerReadings(part: NonNullable<ComputerParts['power']>): SeriesReading[] {
  return [
    [seriesId('power', 'totalWatts'), part.totalWatts],
    [seriesId('power', 'batteryWatts'), part.batteryWatts],
  ];
}

export function readingsOf(parts: ComputerParts): SeriesReading[] {
  return [
    ...(parts.summary === undefined ? [] : summaryReadings(parts.summary)),
    ...(parts.cpu === undefined ? [] : cpuReadings(parts.cpu)),
    ...(parts.gpu === undefined ? [] : gpuReadings(parts.gpu.gpus)),
    ...(parts.memory === undefined ? [] : memoryReadings(parts.memory)),
    ...(parts.disks === undefined ? [] : diskReadings(parts.disks)),
    ...(parts.network === undefined ? [] : networkReadings(parts.network)),
    ...(parts.sensors === undefined ? [] : sensorReadings(parts.sensors)),
    ...(parts.power === undefined ? [] : powerReadings(parts.power)),
  ];
}
