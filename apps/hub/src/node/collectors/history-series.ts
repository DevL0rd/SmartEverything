import type { ComputerSummary, CpuPart, GpuSnapshot, SampleParts } from '@smarteverything/domain';

export interface SeriesPoint {
  readonly topic: string;
  readonly key: string;
  readonly unit: string | null;
  readonly value: number | null;
}

interface Column<T> {
  readonly key: string;
  readonly unit: string | null;
  readonly read: (part: T) => number | null;
}

const PERCENT = '%';
const CELSIUS = '°C';
const WATTS = 'W';
const RATE = 'B/s';
const BYTES = 'B';

const SUMMARY_COLUMNS: readonly Column<ComputerSummary>[] = [
  { key: 'cpuLoad', unit: PERCENT, read: (part) => part.cpuLoad },
  { key: 'cpuTemperature', unit: CELSIUS, read: (part) => part.cpuTemperature },
  { key: 'memoryPercent', unit: PERCENT, read: (part) => part.memoryPercent },
  { key: 'swapPercent', unit: PERCENT, read: (part) => part.swapPercent },
  { key: 'gpuLoad', unit: PERCENT, read: (part) => part.gpuLoad },
  { key: 'gpuTemperature', unit: CELSIUS, read: (part) => part.gpuTemperature },
  { key: 'gpuMemoryPercent', unit: PERCENT, read: (part) => part.gpuMemoryPercent },
  { key: 'cpuWatts', unit: WATTS, read: (part) => part.cpuWatts },
  { key: 'gpuWatts', unit: WATTS, read: (part) => part.gpuWatts },
  { key: 'downloadRate', unit: RATE, read: (part) => part.downloadRate },
  { key: 'uploadRate', unit: RATE, read: (part) => part.uploadRate },
  { key: 'fullestDiskPercent', unit: PERCENT, read: (part) => part.fullestDisk?.percent ?? null },
  { key: 'batteryLevel', unit: PERCENT, read: (part) => part.batteryLevel },
  { key: 'totalWatts', unit: WATTS, read: (part) => part.totalWatts },
  { key: 'processCount', unit: null, read: (part) => part.processCount },
];

const CPU_COLUMNS: readonly Column<CpuPart>[] = [
  { key: 'load', unit: PERCENT, read: (part) => part.load },
  { key: 'performanceLoad', unit: PERCENT, read: (part) => part.performanceLoad },
  { key: 'efficiencyLoad', unit: PERCENT, read: (part) => part.efficiencyLoad },
  { key: 'frequencyGhz', unit: 'GHz', read: (part) => part.frequencyGhz },
  { key: 'temperature', unit: CELSIUS, read: (part) => part.temperature },
  { key: 'powerWatts', unit: WATTS, read: (part) => part.powerWatts },
];

const GPU_COLUMNS: readonly Column<GpuSnapshot>[] = [
  { key: 'load', unit: PERCENT, read: (gpu) => gpu.load },
  { key: 'memoryUsedBytes', unit: BYTES, read: (gpu) => gpu.memoryUsedBytes },
  { key: 'temperature', unit: CELSIUS, read: (gpu) => gpu.temperature },
  { key: 'powerWatts', unit: WATTS, read: (gpu) => gpu.powerWatts },
  { key: 'clockMhz', unit: 'MHz', read: (gpu) => gpu.clockMhz },
  { key: 'fanPercent', unit: PERCENT, read: (gpu) => gpu.fanPercent },
];

function pointsOf<T>(
  topic: string,
  prefix: string,
  part: T,
  columns: readonly Column<T>[],
): SeriesPoint[] {
  return columns.map((column) => ({
    topic,
    key: `${prefix}${column.key}`,
    unit: column.unit,
    value: column.read(part),
  }));
}

function point(topic: string, key: string, unit: string | null, value: number): SeriesPoint {
  return { topic, key, unit, value };
}

function uniqueKeys(keys: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return keys.map((key) => {
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    return count === 1 ? key : `${key}#${String(count)}`;
  });
}

function cpuPoints(part: CpuPart): SeriesPoint[] {
  return [
    ...pointsOf('cpu', '', part, CPU_COLUMNS),
    ...part.cores.map((load, index) => point('cpu', `core${String(index)}`, PERCENT, load)),
  ];
}

function gpuPoints(gpus: readonly GpuSnapshot[]): SeriesPoint[] {
  return gpus.flatMap((gpu) => pointsOf('gpu', `${gpu.id}.`, gpu, GPU_COLUMNS));
}

function diskPoints(part: NonNullable<SampleParts['disks']>): SeriesPoint[] {
  return part.disks.flatMap((disk) => [
    point('disks', `${disk.device}.readRate`, RATE, disk.readRate),
    point('disks', `${disk.device}.writeRate`, RATE, disk.writeRate),
    ...(disk.temperature === null
      ? []
      : [point('disks', `${disk.device}.temperature`, CELSIUS, disk.temperature)]),
  ]);
}

function networkPoints(part: NonNullable<SampleParts['network']>): SeriesPoint[] {
  return [
    point('network', 'downloadRate', RATE, part.downloadRate),
    point('network', 'uploadRate', RATE, part.uploadRate),
    ...part.interfaces.flatMap((adapter) => [
      point('network', `${adapter.name}.downloadRate`, RATE, adapter.downloadRate),
      point('network', `${adapter.name}.uploadRate`, RATE, adapter.uploadRate),
      ...(adapter.signalPercent === null
        ? []
        : [point('network', `${adapter.name}.signalPercent`, PERCENT, adapter.signalPercent)]),
    ]),
  ];
}

function sensorPoints(part: NonNullable<SampleParts['sensors']>): SeriesPoint[] {
  const sensorKeys = uniqueKeys(part.sensors.map((sensor) => `${sensor.chip}.${sensor.label}`));
  const fanKeys = uniqueKeys(part.fans.map((fan) => `fan.${fan.label}`));
  return [
    ...part.sensors.map((sensor, index) =>
      point('sensors', sensorKeys[index] ?? sensor.label, CELSIUS, sensor.celsius),
    ),
    ...part.fans.map((fan, index) => point('sensors', fanKeys[index] ?? fan.label, 'rpm', fan.rpm)),
  ];
}

function memoryPoints(part: NonNullable<SampleParts['memory']>): SeriesPoint[] {
  return [
    point('memory', 'usedBytes', BYTES, part.usedBytes),
    point('memory', 'availableBytes', BYTES, part.availableBytes),
    point('memory', 'cachedBytes', BYTES, part.cachedBytes),
    point('memory', 'swapUsedBytes', BYTES, part.swapUsedBytes),
    point('memory', 'swapInRate', RATE, part.swapInRate),
    point('memory', 'swapOutRate', RATE, part.swapOutRate),
  ];
}

function powerPoints(part: NonNullable<SampleParts['power']>): SeriesPoint[] {
  return [
    ...(part.totalWatts === null ? [] : [point('power', 'totalWatts', WATTS, part.totalWatts)]),
    ...(part.batteryWatts === null
      ? []
      : [point('power', 'batteryWatts', WATTS, part.batteryWatts)]),
  ];
}

export function seriesOf(parts: SampleParts): SeriesPoint[] {
  return [
    ...(parts.summary === undefined ? [] : pointsOf('summary', '', parts.summary, SUMMARY_COLUMNS)),
    ...(parts.cpu === undefined ? [] : cpuPoints(parts.cpu)),
    ...(parts.gpu === undefined ? [] : gpuPoints(parts.gpu.gpus)),
    ...(parts.memory === undefined ? [] : memoryPoints(parts.memory)),
    ...(parts.disks === undefined ? [] : diskPoints(parts.disks)),
    ...(parts.network === undefined ? [] : networkPoints(parts.network)),
    ...(parts.sensors === undefined ? [] : sensorPoints(parts.sensors)),
    ...(parts.power === undefined ? [] : powerPoints(parts.power)),
  ];
}
