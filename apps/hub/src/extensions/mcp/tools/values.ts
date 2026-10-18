import {
  COLOR_INPUT_FORMS,
  colorFromInput,
  kelvinFromText,
  writePresentedColor,
  type JsonValue,
  type PresentedCapability,
} from '@smarteverything/domain';
import { z } from 'zod';
import { ToolError } from './registry';

const TEMPERATURE_UNITS = ['celsius', 'fahrenheit'] as const;

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

const MIRED_PER_KELVIN = 1_000_000;

function colourFor(presented: PresentedCapability, value: JsonValue): JsonValue {
  const color = colorFromInput(value);
  if (color === null) {
    throw new ToolError(
      `${JSON.stringify(value)} is not a colour. ${presented.label} takes ${COLOR_INPUT_FORMS}. Brightness is a separate capability.`,
    );
  }
  return writePresentedColor(presented, color);
}

function whiteToneFor(presented: PresentedCapability, value: string): JsonValue {
  const kelvin = kelvinFromText(value);
  if (kelvin === null) {
    return value;
  }
  return presented.unit?.toLowerCase().startsWith('mired') === true
    ? Math.round(MIRED_PER_KELVIN / kelvin)
    : kelvin;
}

function isColour(presented: PresentedCapability): boolean {
  return presented.capability.value.kind === 'color' || presented.colorEncoding !== undefined;
}

export function valueFor(
  presented: PresentedCapability,
  value: JsonValue,
  unit: TemperatureUnit | undefined,
): JsonValue {
  if (isColour(presented) && typeof value !== 'number') {
    return colourFor(presented, value);
  }
  if (
    typeof value === 'string' &&
    presented.role === 'color_temperature' &&
    presented.capability.value.kind === 'number'
  ) {
    return whiteToneFor(presented, value);
  }
  if (typeof value === 'number' && presented.capability.value.kind === 'number') {
    return numberIn(presented, value, unit);
  }
  if (typeof value === 'string' && presented.capability.value.kind === 'enum') {
    return option(presented, value);
  }
  return value;
}
