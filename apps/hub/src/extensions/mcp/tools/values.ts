import type { JsonValue, PresentedCapability } from '@smarteverything/domain';
import { z } from 'zod';

export const TEMPERATURE_UNITS = ['celsius', 'fahrenheit'] as const;

export type TemperatureUnit = (typeof TEMPERATURE_UNITS)[number];

export const VALUE_UNIT = z
  .enum(TEMPERATURE_UNITS)
  .optional()
  .describe('Unit of a temperature value; converted to the device’s own unit');

const DEVICE_UNITS: Readonly<Record<string, TemperatureUnit>> = {
  '°C': 'celsius',
  '°F': 'fahrenheit',
};

function converted(value: number, from: TemperatureUnit, to: TemperatureUnit): number {
  if (from === to) {
    return value;
  }
  const result = from === 'celsius' ? (value * 9) / 5 + 32 : ((value - 32) * 5) / 9;
  return Math.round(result * 10) / 10;
}

function numberIn(
  presented: PresentedCapability,
  value: number,
  unit: TemperatureUnit | undefined,
): number {
  const own = presented.unit === null ? undefined : DEVICE_UNITS[presented.unit];
  if (unit === undefined || own === undefined) {
    return value;
  }
  return converted(value, unit, own);
}

function option(presented: PresentedCapability, value: string): string {
  const wanted = value.trim().toLowerCase();
  const found = presented.options.find(
    (candidate) =>
      candidate.value === value ||
      candidate.value.toLowerCase() === wanted ||
      candidate.label.toLowerCase() === wanted,
  );
  return found === undefined ? value : found.value;
}

export function valueFor(
  presented: PresentedCapability,
  value: JsonValue,
  unit: TemperatureUnit | undefined,
): JsonValue {
  if (typeof value === 'number' && presented.capability.value.kind === 'number') {
    return numberIn(presented, value, unit);
  }
  if (typeof value === 'string' && presented.capability.value.kind === 'enum') {
    return option(presented, value);
  }
  return value;
}
