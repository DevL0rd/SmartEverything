import type { FanSnapshot, SensorSnapshot } from '@smarteverything/domain';
import { celsius, orNull } from '../rounding';
import { PerTick, type ReadFailed, type Tick } from '../tick';
import {
  PLAUSIBLE_MAX,
  PLAUSIBLE_MIN,
  scanHwmon,
  type CpuSensorRole,
  type FanInput,
  type HwmonInputs,
  type TemperatureInput,
} from './hwmon';
import type { KernelFiles } from './kernel-file';
import { Rescan } from './rescan';

const MILLI = 1000;
const CPU_ROLE_ORDER: readonly CpuSensorRole[] = ['core', 'package', 'tdie', 'tctl'];
const SLOW_READ_MS = 0.2;
const SLOW_INTERVAL_MS = 10_000;
const MEASURE_READS = 4;

export interface SensorReading {
  readonly cpuTemperature: number | null;
  readonly fans: readonly FanSnapshot[];
  readonly sensors: readonly SensorSnapshot[];
}

interface Measured {
  readonly input: TemperatureInput;
  readonly celsius: number;
}

interface Tiered {
  readonly temperatures: readonly (TemperatureInput & { readonly slow: boolean })[];
  readonly fans: readonly (FanInput & { readonly slow: boolean })[];
}

function mean(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function cpuTemperature(measured: readonly Measured[]): number | null {
  for (const role of CPU_ROLE_ORDER) {
    const value = mean(
      measured.filter((item) => item.input.cpuRole === role).map((item) => item.celsius),
    );
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

export class SensorCollector {
  private readonly inputs = new Rescan(() => this.measureTiers(this.scan()));
  private readonly reading = new PerTick<SensorReading>();
  private readonly values = new Map<string, number>();
  private slowAt: number | null = null;
  private scanned: Tiered | null = null;

  constructor(
    private readonly files: KernelFiles,
    private readonly failed: ReadFailed,
    private readonly scan: () => HwmonInputs = scanHwmon,
  ) {}

  read(tick: Tick): SensorReading {
    return this.reading.get(tick, () => this.readAll(tick.at));
  }

  hasFans(at: number): boolean {
    return this.inputs.current(at).fans.length > 0;
  }

  celsiusAt(tick: Tick, path: string): number | null {
    this.read(tick);
    return this.values.get(path) ?? null;
  }

  private readAll(at: number): SensorReading {
    const inputs = this.inputs.current(at);
    const rescanned = inputs !== this.scanned;
    if (rescanned) {
      this.forgetRemoved(inputs);
    }
    const refreshSlow = rescanned || this.slowAt === null || at - this.slowAt >= SLOW_INTERVAL_MS;
    if (refreshSlow) {
      this.slowAt = at;
    }
    const refresh = (slow: boolean): boolean => !slow || refreshSlow;
    const measured = inputs.temperatures.flatMap((input): Measured[] => {
      const value = refresh(input.slow)
        ? this.measure(input.path, MILLI)
        : this.values.get(input.path);
      return value === undefined || value < PLAUSIBLE_MIN || value > PLAUSIBLE_MAX
        ? []
        : [{ input, celsius: value }];
    });
    const fans = inputs.fans.flatMap((fan): FanSnapshot[] => {
      const rpm = refresh(fan.slow) ? this.measure(fan.path, 1) : this.values.get(fan.path);
      return rpm === undefined ? [] : [{ label: fan.label, rpm, maxRpm: fan.maxRpm }];
    });
    return {
      cpuTemperature: orNull(cpuTemperature(measured), celsius),
      fans,
      sensors: measured
        .filter((item) => item.input.cpuRole === null)
        .map((item) => ({
          chip: item.input.chip,
          label: item.input.label,
          celsius: celsius(item.celsius),
          highCelsius: orNull(item.input.highCelsius, celsius),
          criticalCelsius: orNull(item.input.criticalCelsius, celsius),
        })),
    };
  }

  private forgetRemoved(inputs: Tiered): void {
    this.scanned = inputs;
    const paths = new Set([
      ...inputs.temperatures.map((input) => input.path),
      ...inputs.fans.map((fan) => fan.path),
    ]);
    for (const path of this.values.keys()) {
      if (!paths.has(path)) {
        this.values.delete(path);
      }
    }
  }

  private measure(path: string, divisor: number): number | undefined {
    try {
      const value = Number(this.files.read(path)) / divisor;
      this.values.set(path, value);
      return value;
    } catch (cause) {
      this.inputs.invalidate();
      this.values.delete(path);
      this.failed(`sensor ${path}`, cause);
      return undefined;
    }
  }

  private measureTiers(inputs: HwmonInputs): Tiered {
    const slow = (path: string): boolean => {
      const times: number[] = [];
      for (let attempt = 0; attempt < MEASURE_READS; attempt += 1) {
        const started = performance.now();
        this.files.read(path);
        times.push(performance.now() - started);
      }
      return median(times.slice(1)) >= SLOW_READ_MS;
    };
    return {
      temperatures: inputs.temperatures.map((input) => ({ ...input, slow: slow(input.path) })),
      fans: inputs.fans.map((fan) => ({ ...fan, slow: slow(fan.path) })),
    };
  }
}
