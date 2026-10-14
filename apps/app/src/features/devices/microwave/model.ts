import {
  MICROWAVE_KEYS,
  MICROWAVE_SPECIFICATION,
  MICROWAVE_MODE_LABELS,
  microwaveReadiness,
  microwaveProgramError,
  type MicrowaveProgram,
  microwaveRemaining,
  microwavePowerOptions,
  type MicrowaveMode,
  type JsonValue,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { Device, DeviceValues } from '../../../store/state';

export function microwaveValues(
  values: DeviceValues,
): Readonly<Record<string, JsonValue | undefined>> {
  return Object.fromEntries(Object.entries(values).map(([key, entry]) => [key, entry.value]));
}
export interface MicrowaveConfiguration {
  readonly modes: readonly MicrowaveMode[];
  readonly problem: string | null;
  readonly supportedPower: JsonValue | undefined;
  readonly unit: string;
}
export function microwaveConfiguration(
  device: Device,
  values: DeviceValues,
): MicrowaveConfiguration {
  const spec = MICROWAVE_SPECIFICATION.safeParse(values[MICROWAVE_KEYS.specification]?.value);
  const supported = z.array(z.string()).safeParse(values[MICROWAVE_KEYS.supportedModes]?.value);
  const unit = temperatureUnit(device);
  return {
    modes:
      spec.success && supported.success
        ? spec.data.single.filter((mode) => supported.data.includes(mode.mode))
        : [],
    problem:
      spec.success && supported.success
        ? null
        : 'Cooking options have not been reported correctly. Refresh readings or check Diagnostics.',
    supportedPower: values[MICROWAVE_KEYS.supportedPower]?.value,
    unit,
  };
}
export function microwaveReason(device: Device, values: DeviceValues): string | null {
  return device.online ? microwaveReadiness(microwaveValues(values)) : 'The microwave is offline.';
}
export function microwaveModeLabel(mode: string): string {
  return MICROWAVE_MODE_LABELS[mode] ?? mode;
}
export function microwaveStateLine(values: DeviceValues): string {
  const state = values[MICROWAVE_KEYS.state]?.value;
  const job = values[MICROWAVE_KEYS.job]?.value;
  if (job === 'finished') {
    return 'Finished';
  }
  const labels: Readonly<Record<string, string>> = {
    ready: 'Ready',
    running: 'Cooking',
    paused: 'Paused',
  };
  const remaining = microwaveRemaining(microwaveValues(values));
  const label = typeof state === 'string' ? (labels[state] ?? state) : 'Waiting for cooking state';
  return remaining === null ? label : `${label} · ${remaining} remaining`;
}
export function initialProgram(
  mode: MicrowaveMode,
  config: MicrowaveConfiguration,
): {
  readonly mode: string;
  readonly duration: string;
  readonly power: string;
  readonly temperature: number;
} {
  const powers = microwavePowerOptions(mode, config.supportedPower);
  const suggested = mode.supportedOptions.powerLevel?.default;
  return {
    mode: mode.mode,
    duration: mode.supportedOptions.operationTime?.default ?? '00:00:00',
    power: preferredPower(powers, suggested),
    temperature: mode.supportedOptions.temperature?.[config.unit]?.default ?? 0,
  };
}

function temperatureUnit(device: Device): string {
  const descriptor = device.capabilities.find(
    (capability) => capability.key === 'temperature',
  )?.value;
  return descriptor?.kind === 'number' && descriptor.unit !== undefined ? descriptor.unit : 'C';
}

export function reportedProgram(
  mode: MicrowaveMode,
  config: MicrowaveConfiguration,
  values: DeviceValues,
): MicrowaveProgram {
  const initial = initialProgram(mode, config);
  const duration = values[MICROWAVE_KEYS.duration]?.value;
  const power = values[MICROWAVE_KEYS.power]?.value;
  const temperature = values[MICROWAVE_KEYS.temperature]?.value;
  const reported = {
    mode: mode.mode,
    duration: typeof duration === 'string' ? duration : initial.duration,
    power: typeof power === 'string' ? power : initial.power,
    temperature: typeof temperature === 'number' ? temperature : initial.temperature,
  };
  return microwaveProgramError(
    reported,
    mode,
    microwavePowerOptions(mode, config.supportedPower),
    config.unit,
  ) === null
    ? reported
    : initial;
}

function preferredPower(powers: readonly string[], suggested: string | undefined): string {
  if (suggested !== undefined && powers.includes(suggested)) {
    return suggested;
  }
  return powers[0] ?? '';
}
