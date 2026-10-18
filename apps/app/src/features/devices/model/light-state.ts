import {
  levelPercent,
  levelRangeOf,
  withRole,
  type JsonValue,
  type PresentedCapability,
} from '@smarteverything/domain';
import {
  WHITE_MAX_KELVIN,
  WHITE_MIN_KELVIN,
  percentOf,
  valueAtPercent,
} from '../../../components/level-math';
import type { DeviceValues } from '../../../store/state';
import { powerStateOf, valueOf, type DeviceModel } from './device-model';
import type { StripKind } from './colour-presets';
import type { LightMode, LightPower } from './light-state-line';

export interface LightParts {
  readonly brightness: PresentedCapability | null;
  readonly temperature: PresentedCapability | null;
  readonly colour: PresentedCapability | null;
}

export interface LightState {
  readonly online: boolean;
  readonly power: LightPower;
  readonly level: number | null;
  readonly kelvin: number | null;
  readonly mode: LightMode;
}

const KELVIN_UNIT = 'K';

function writableNumber(presented: PresentedCapability | undefined): PresentedCapability | null {
  return presented?.writable === true && presented.capability.value.kind === 'number'
    ? presented
    : null;
}

export function lightPartsOf(model: DeviceModel): LightParts {
  const colour = model.presentation.capabilities.find(
    (candidate) =>
      candidate.writable &&
      (candidate.colorEncoding !== undefined || candidate.capability.value.kind === 'color'),
  );
  return {
    brightness: writableNumber(withRole(model.presentation, 'brightness')),
    temperature: writableNumber(withRole(model.presentation, 'color_temperature')),
    colour: colour ?? null,
  };
}

export function colourAccessOf(parts: LightParts): StripKind | null {
  if (parts.colour !== null) {
    return 'colour';
  }
  return parts.temperature === null ? null : 'white';
}

function toKelvin(presented: PresentedCapability, value: number): number {
  const range = presented.capability.value;
  if (presented.unit === KELVIN_UNIT || range.kind !== 'number') {
    return value;
  }
  return Math.round(
    WHITE_MIN_KELVIN +
      (percentOf(value, range.min, range.max) / 100) * (WHITE_MAX_KELVIN - WHITE_MIN_KELVIN),
  );
}

export function fromKelvin(presented: PresentedCapability, kelvin: number): number {
  const range = presented.capability.value;
  if (range.kind !== 'number') {
    return kelvin;
  }
  if (presented.unit === KELVIN_UNIT) {
    return valueAtPercent(
      percentOf(kelvin, range.min, range.max),
      range.min,
      range.max,
      range.step,
    );
  }
  const share = ((kelvin - WHITE_MIN_KELVIN) / (WHITE_MAX_KELVIN - WHITE_MIN_KELVIN)) * 100;
  return valueAtPercent(share, range.min, range.max, range.step);
}

function observedAt(values: DeviceValues, presented: PresentedCapability | null): number {
  const at = presented === null ? undefined : values[presented.key]?.observedAt;
  return at === undefined ? 0 : Date.parse(at);
}

function modeOf(values: DeviceValues, parts: LightParts): LightMode {
  const temperature = valueOf(values, parts.temperature);
  if (parts.colour === null || values[parts.colour.key] === undefined) {
    return 'white';
  }
  if (typeof temperature !== 'number') {
    return 'colour';
  }
  return observedAt(values, parts.colour) > observedAt(values, parts.temperature)
    ? 'colour'
    : 'white';
}

function powerOf(model: DeviceModel, values: DeviceValues): LightPower {
  const power = powerStateOf(model, values);
  return power === 'on' || power === 'off' ? power : 'unknown';
}

function levelOf(
  presented: PresentedCapability | null,
  value: JsonValue | undefined,
): number | null {
  const range = presented === null ? null : levelRangeOf(presented);
  return range === null || typeof value !== 'number' ? null : levelPercent(range, value);
}

export function lightStateOf(
  model: DeviceModel,
  parts: LightParts,
  values: DeviceValues,
): LightState {
  const brightness = valueOf(values, parts.brightness);
  const temperature = valueOf(values, parts.temperature);
  return {
    online: model.device.online,
    power: model.device.online ? powerOf(model, values) : 'unknown',
    level: levelOf(parts.brightness, brightness),
    kelvin:
      parts.temperature === null || typeof temperature !== 'number'
        ? null
        : toKelvin(parts.temperature, temperature),
    mode: modeOf(values, parts),
  };
}
