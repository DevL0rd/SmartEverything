import {
  BYTE_RATE_UNIT,
  type AdapterSink,
  CAPABILITY_CATALOGUE,
  type ComputerMetric,
  type ComputerSummary,
  type DeviceCapability,
} from '@smarteverything/domain';
import type { MetricHistory } from '../metrics/history';

interface Headline {
  readonly key: ComputerMetric;
  readonly unit: string;
  readonly max: number;
  readonly read: (summary: ComputerSummary) => number | null;
}

interface HeadlineValue {
  readonly key: ComputerMetric;
  readonly value: number;
  readonly rounded: number;
}

const PERCENT = 100;
const CELSIUS_MAX = 150;
const WATTS_MAX = 10_000;
const RATE_MAX = 1e12;
const RATE_DIGITS = 3;

function percent(key: ComputerMetric, read: Headline['read']): Headline {
  return { key, unit: '%', max: PERCENT, read };
}

const HEADLINES: readonly Headline[] = [
  percent('cpu_load', (s) => s.cpuLoad),
  percent('memory_used', (s) => s.memoryPercent),
  percent('swap_used', (s) => s.swapPercent),
  percent('gpu_load', (s) => s.gpuLoad),
  percent('gpu_memory_used', (s) => s.gpuMemoryPercent),
  percent('disk_used', (s) => s.fullestDisk?.percent ?? null),
  percent('battery_level', (s) => s.batteryLevel),
  { key: 'cpu_temperature', unit: '°C', max: CELSIUS_MAX, read: (s) => s.cpuTemperature },
  { key: 'gpu_temperature', unit: '°C', max: CELSIUS_MAX, read: (s) => s.gpuTemperature },
  { key: 'cpu_power', unit: 'W', max: WATTS_MAX, read: (s) => s.cpuWatts },
  { key: 'gpu_power', unit: 'W', max: WATTS_MAX, read: (s) => s.gpuWatts },
  { key: 'download_rate', unit: BYTE_RATE_UNIT, max: RATE_MAX, read: (s) => s.downloadRate },
  { key: 'upload_rate', unit: BYTE_RATE_UNIT, max: RATE_MAX, read: (s) => s.uploadRate },
];

function rounded(headline: Headline, value: number): number {
  return Math.round(
    headline.unit === BYTE_RATE_UNIT ? Number(value.toPrecision(RATE_DIGITS)) : value,
  );
}

function headlineValues(summary: ComputerSummary): HeadlineValue[] {
  return HEADLINES.flatMap((headline) => {
    const value = headline.read(summary);
    return value === null ? [] : [{ key: headline.key, value, rounded: rounded(headline, value) }];
  });
}

export function headlineCapabilities(summary: ComputerSummary): DeviceCapability[] {
  return HEADLINES.filter((headline) => headline.read(summary) !== null).map((headline) => ({
    key: headline.key,
    label: CAPABILITY_CATALOGUE[headline.key].label,
    access: 'read',
    value: { kind: 'number', min: 0, max: headline.max, step: 1, unit: headline.unit },
  }));
}

const STATE_EVERY_MS = 10_000;

const EVENT_HEADLINES: ReadonlySet<ComputerMetric> = new Set(['battery_level']);

export interface HeadlineTarget {
  readonly deviceId: string;
  readonly externalId: string;
}

export class HeadlineRecorder {
  private stateAt = 0;
  private readonly last = new Map<ComputerMetric, number>();

  constructor(
    private readonly history: Pick<MetricHistory, 'push'>,
    private readonly sink: Pick<AdapterSink, 'state'>,
  ) {}

  record(target: HeadlineTarget, summary: ComputerSummary, observedAt: string): void {
    const at = new Date(observedAt);
    const values = headlineValues(summary);
    for (const item of values) this.history.push(target.deviceId, item.key, item.value, at);
    const due = at.getTime() - this.stateAt >= STATE_EVERY_MS;
    if (due) this.stateAt = at.getTime();
    for (const item of values) {
      const changed = EVENT_HEADLINES.has(item.key) && this.last.get(item.key) !== item.rounded;
      if (!due && !changed) continue;
      this.last.set(item.key, item.rounded);
      this.sink.state({
        externalId: target.externalId,
        capability: item.key,
        value: item.rounded,
        observedAt,
      });
    }
  }

  reset(): void {
    this.stateAt = 0;
    this.last.clear();
  }
}
