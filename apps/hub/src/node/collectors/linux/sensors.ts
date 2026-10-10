import type { FanSnapshot, SensorSnapshot } from '@smarteverything/domain';
import { scanHwmon, type CpuSensorRole, type TemperatureInput } from './hwmon';
import type { KernelFiles } from './kernel-file';
import { Rescan } from './rescan';

const MILLI = 1000;
const PLAUSIBLE_MIN = -60;
const PLAUSIBLE_MAX = 200;
const CPU_ROLE_ORDER: readonly CpuSensorRole[] = ['core', 'package', 'tdie', 'tctl'];

export interface SensorReading {
  readonly cpuTemperature: number | null;
  readonly fans: readonly FanSnapshot[];
  readonly sensors: readonly SensorSnapshot[];
}

interface Measured {
  readonly input: TemperatureInput;
  readonly celsius: number;
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

export class SensorCollector {
  private readonly inputs = new Rescan(scanHwmon);

  constructor(private readonly files: KernelFiles) {}

  read(at: number): SensorReading {
    const inputs = this.inputs.current(at);
    try {
      const measured = inputs.temperatures
        .map((input) => ({
          input,
          celsius: Number(this.files.read(input.path)) / MILLI,
        }))
        .filter((item) => item.celsius >= PLAUSIBLE_MIN && item.celsius <= PLAUSIBLE_MAX);
      return {
        cpuTemperature: cpuTemperature(measured),
        fans: inputs.fans.map((fan) => ({
          label: fan.label,
          rpm: Number(this.files.read(fan.path)),
          maxRpm: fan.maxRpm,
        })),
        sensors: measured
          .filter((item) => item.input.cpuRole === null)
          .map((item) => ({
            chip: item.input.chip,
            label: item.input.label,
            celsius: item.celsius,
          })),
      };
    } catch (cause) {
      this.inputs.invalidate();
      throw cause;
    }
  }
}
