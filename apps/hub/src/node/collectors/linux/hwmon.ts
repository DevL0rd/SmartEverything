import { existsSync, readdirSync, readFileSync } from 'node:fs';

const HWMON_ROOT = '/sys/class/hwmon';
const MILLI = 1000;
export const PLAUSIBLE_MIN = -60;
export const PLAUSIBLE_MAX = 200;
const CPU_CHIPS: ReadonlySet<string> = new Set(['coretemp', 'k10temp', 'zenpower']);

export type CpuSensorRole = 'core' | 'package' | 'tdie' | 'tctl';

export interface TemperatureInput {
  readonly chip: string;
  readonly label: string;
  readonly path: string;
  readonly cpuRole: CpuSensorRole | null;
  readonly highCelsius: number | null;
  readonly criticalCelsius: number | null;
}

export interface FanInput {
  readonly label: string;
  readonly path: string;
  readonly maxRpm: number | null;
}

export interface HwmonInputs {
  readonly temperatures: readonly TemperatureInput[];
  readonly fans: readonly FanInput[];
}

function text(path: string): string | null {
  const value = existsSync(path) ? readFileSync(path, 'utf8').trim() : '';
  return value === '' ? null : value;
}

function celsiusOf(path: string): number | null {
  const milli = Number(text(path));
  const value = milli / MILLI;
  return Number.isFinite(value) && value > PLAUSIBLE_MIN && value < PLAUSIBLE_MAX ? value : null;
}

function readable(path: string): boolean {
  try {
    readFileSync(path, 'utf8');
    return true;
  } catch (cause) {
    if (cause instanceof Error) {
      return false;
    }
    throw cause;
  }
}

function cpuRoleOf(chip: string, label: string): CpuSensorRole | null {
  if (!CPU_CHIPS.has(chip)) {
    return null;
  }
  const lower = label.toLowerCase();
  if (lower.includes('package')) {
    return 'package';
  }
  if (lower === 'tdie' || lower === 'tctl') {
    return lower;
  }
  return 'core';
}

function inputsOf(directory: string, prefix: 'temp' | 'fan'): string[] {
  return readdirSync(directory)
    .filter((name) => name.startsWith(prefix) && name.endsWith('_input'))
    .map((name) => `${directory}/${name}`)
    .filter(readable);
}

function chipInputs(directory: string): HwmonInputs {
  const chip = text(`${directory}/name`) ?? 'sensor';
  const temperatures = inputsOf(directory, 'temp').map((path) => {
    const label = text(path.replace(/_input$/, '_label')) ?? chip;
    return {
      chip,
      label,
      path,
      cpuRole: cpuRoleOf(chip, label),
      highCelsius: celsiusOf(path.replace(/_input$/, '_max')),
      criticalCelsius: celsiusOf(path.replace(/_input$/, '_crit')),
    };
  });
  const fans = inputsOf(directory, 'fan').map((path) => {
    const max = text(path.replace(/_input$/, '_max'));
    return {
      label: text(path.replace(/_input$/, '_label')) ?? chip,
      path,
      maxRpm: max === null || Number(max) <= 0 ? null : Number(max),
    };
  });
  return { temperatures, fans };
}

export function scanHwmon(): HwmonInputs {
  const chips = readdirSync(HWMON_ROOT).map((name) => chipInputs(`${HWMON_ROOT}/${name}`));
  return {
    temperatures: chips.flatMap((chip) => chip.temperatures),
    fans: chips.flatMap((chip) => chip.fans),
  };
}
