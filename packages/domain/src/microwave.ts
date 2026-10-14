import { z } from 'zod';
import type { JsonValue } from './values';
export * from './microwave-recipes';
export * from './microwave-readings';

export * from './microwave-core';
import { MICROWAVE_DURATION, MICROWAVE_KEYS } from './microwave-core';

const NUMERIC_RANGE = z
  .object({
    min: z.number(),
    max: z.number(),
    default: z.number(),
    resolution: z.number().positive(),
  })
  .refine(
    (range) => range.min <= range.max && range.default >= range.min && range.default <= range.max,
  );
const TIME_RANGE = z.object({
  min: MICROWAVE_DURATION,
  max: MICROWAVE_DURATION,
  default: MICROWAVE_DURATION,
  resolution: MICROWAVE_DURATION,
});
const MODE_SPECIFICATION = z.object({
  mode: z.string(),
  supportedOperations: z.array(z.string()),
  supportedOptions: z.object({
    temperature: z.record(z.string(), NUMERIC_RANGE).optional(),
    operationTime: TIME_RANGE.optional(),
    powerLevel: z.object({ default: z.string(), supportedValues: z.array(z.string()) }).optional(),
  }),
});
export const MICROWAVE_SPECIFICATION = z.object({ single: z.array(MODE_SPECIFICATION) });
export type MicrowaveMode = z.infer<typeof MODE_SPECIFICATION>;
export type MicrowaveTemperatureRange = z.infer<typeof NUMERIC_RANGE>;
export type MicrowaveTimeRange = z.infer<typeof TIME_RANGE>;

export function microwaveSeconds(duration: string): number {
  const parts = MICROWAVE_DURATION.parse(duration).split(':').map(Number);
  const [hours, minutes, seconds] = z.tuple([z.number(), z.number(), z.number()]).parse(parts);
  return hours * 3600 + minutes * 60 + seconds;
}

export function microwaveDuration(seconds: number): string {
  const pad = (part: number): string => String(part).padStart(2, '0');
  return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;
}

export function microwaveModes(
  specification: JsonValue | undefined,
  supported: JsonValue | undefined,
): readonly MicrowaveMode[] {
  if (specification === undefined || supported === undefined) {
    return [];
  }
  const specs = MICROWAVE_SPECIFICATION.parse(specification);
  const modes = z.array(z.string()).parse(supported);
  return specs.single.filter((mode) => modes.includes(mode.mode));
}

export function microwavePowerOptions(
  mode: MicrowaveMode,
  supported: JsonValue | undefined,
): readonly string[] {
  const power = mode.supportedOptions.powerLevel;
  if (power === undefined || supported === undefined) {
    return [];
  }
  const available = z.array(z.string()).parse(supported);
  return power.supportedValues.filter((value) => available.includes(value));
}

export function microwaveReadiness(
  values: Readonly<Record<string, JsonValue | undefined>>,
): string | null {
  if (values[MICROWAVE_KEYS.remote] !== 'true') {
    return 'Enable remote control on the microwave.';
  }
  if (values[MICROWAVE_KEYS.door] !== 'closed') {
    return 'Close the microwave door.';
  }
  if (values[MICROWAVE_KEYS.lock] !== 'unlocked') {
    return 'Unlock the controls on the microwave.';
  }
  return null;
}

export interface MicrowaveProgram {
  readonly mode: string;
  readonly duration: string;
  readonly power: string;
  readonly temperature: number;
}

function durationError(duration: string, time: MicrowaveTimeRange): string | null {
  const parsed = MICROWAVE_DURATION.safeParse(duration);
  if (!parsed.success) {
    return 'Enter the duration as hours:minutes:seconds.';
  }
  const seconds = microwaveSeconds(parsed.data);
  const min = microwaveSeconds(time.min);
  const step = microwaveSeconds(time.resolution);
  return step <= 0 ||
    seconds < min ||
    seconds > microwaveSeconds(time.max) ||
    (seconds - min) % step !== 0
    ? `Use ${time.min}–${time.max}, in ${time.resolution} steps.`
    : null;
}

function temperatureError(
  value: number,
  range: MicrowaveTemperatureRange,
  unit: string,
): string | null {
  return value < range.min || value > range.max || (value - range.min) % range.resolution !== 0
    ? `Use ${String(range.min)}–${String(range.max)} ${unit}, in ${String(range.resolution)}-degree steps.`
    : null;
}

export function microwaveProgramError(
  program: MicrowaveProgram,
  mode: MicrowaveMode,
  powerOptions: readonly string[],
  unit: string,
): string | null {
  const time = mode.supportedOptions.operationTime;
  const timeError = time === undefined ? null : durationError(program.duration, time);
  if (timeError !== null) {
    return timeError;
  }
  if (mode.supportedOptions.powerLevel !== undefined && !powerOptions.includes(program.power)) {
    return 'Choose a supported power level.';
  }
  const temperature = mode.supportedOptions.temperature?.[unit];
  return temperature === undefined
    ? null
    : temperatureError(program.temperature, temperature, unit);
}
