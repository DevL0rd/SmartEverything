import {
  airBand,
  inTier,
  withRole,
  AIR_BAND_LABELS,
  type AirBand,
  type CapabilityRole,
  type DeviceFamily,
  type PresentedCapability,
} from '@smarteverything/domain';
import type { DeviceValues } from '../../../store/state';
import { hasValue, valueOf, type DeviceModel } from './device-model';

const HERO_ROLES: Partial<Readonly<Record<DeviceFamily, readonly CapabilityRole[]>>> = {
  air_purifier: ['pm25', 'air_quality_index', 'pm10'],
  humidifier: ['humidity'],
  dehumidifier: ['humidity'],
  heater: ['temperature'],
  air_conditioner: ['temperature'],
  thermostat: ['temperature'],
  plug: ['power_draw'],
  switch: ['power_draw'],
  sensor: ['temperature', 'humidity', 'pm25', 'co2', 'illuminance', 'motion', 'contact', 'leak'],
};

const NO_HERO_READING: ReadonlySet<DeviceFamily> = new Set(['tower_fan', 'fan', 'light']);

const FIRST_READING_HERO: ReadonlySet<DeviceFamily> = new Set(['sensor', 'generic']);

export function heroReadingOf(
  model: DeviceModel,
  values: DeviceValues,
): PresentedCapability | null {
  if (NO_HERO_READING.has(model.family)) {
    return null;
  }
  const roles = HERO_ROLES[model.family] ?? [];
  for (const role of roles) {
    const found = withRole(model.presentation, role);
    if (found !== undefined && hasValue(values, found)) {
      return found;
    }
  }
  return FIRST_READING_HERO.has(model.family)
    ? (inTier(model.presentation, 'reading').find((presented) => hasValue(values, presented)) ??
        null)
    : null;
}

export function readingsOf(
  model: DeviceModel,
  values: DeviceValues,
  hero: PresentedCapability | null,
): readonly PresentedCapability[] {
  return inTier(model.presentation, 'reading').filter(
    (presented) => presented.key !== hero?.key && hasValue(values, presented),
  );
}

export interface AirReading {
  readonly band: AirBand;
  readonly label: string;
}

export function airOf(hero: PresentedCapability | null, values: DeviceValues): AirReading | null {
  if (hero?.role !== 'pm25') {
    return null;
  }
  const value = valueOf(values, hero);
  if (typeof value !== 'number') {
    return null;
  }
  const band = airBand(value);
  return { band, label: AIR_BAND_LABELS[band] };
}
