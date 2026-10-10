import {
  airBand,
  deviceFamily,
  sleepsBetweenUse,
  type CapabilityRole,
  type DeviceFamily,
  type PresentableDeviceWithCapabilities,
} from '@smarteverything/domain';
import type { ThermalMode, VisualPower, VisualState } from '../types';
import { hsvCss, kelvinCss } from './light-colour';
import {
  flagOf,
  lookupOf,
  numberOf,
  readingOf,
  shareOf,
  textOf,
  valueOf,
  type Lookup,
  type ObservedValues,
} from './lookup';

export interface VisualDevice extends PresentableDeviceWithCapabilities {
  readonly online: boolean;
}

const QUIET_MODE = /sleep|silent|quiet|night/i;
const STRONG_MODE = /strong|turbo|max|boost/i;
const FAVOURITE_MODE = /favou?rite/i;
const NO_WATER = /water|tank/i;
const RESTING_LEVEL = 0.6;
const QUIET_LEVEL = 0.2;

const SPEED_ROLES: readonly CapabilityRole[] = [
  'brightness',
  'fan_speed',
  'fan_mode',
  'mist_level',
  'suction',
  'volume',
];

const SENSOR_READINGS: readonly CapabilityRole[] = [
  'temperature',
  'humidity',
  'pm25',
  'co2',
  'tvoc',
  'hcho',
  'illuminance',
  'pressure',
  'power_draw',
  'battery',
];

const SOURCE_ROLES: readonly CapabilityRole[] = ['app_launch', 'input_source'];

function modeOf(lookup: Lookup): string | null {
  return textOf(lookup, 'purifier_mode') ?? textOf(lookup, 'mode') ?? textOf(lookup, 'hvac_mode');
}

function firstShare(lookup: Lookup, roles: readonly CapabilityRole[]): number | null {
  for (const role of roles) {
    const share = shareOf(lookup, role);
    if (share !== null) {
      return share;
    }
  }
  return null;
}

function levelOf(lookup: Lookup): number {
  const mode = modeOf(lookup) ?? '';
  if (QUIET_MODE.test(mode)) {
    return QUIET_LEVEL;
  }
  const favourite = FAVOURITE_MODE.test(mode) ? shareOf(lookup, 'favourite_level') : null;
  const share = favourite ?? firstShare(lookup, SPEED_ROLES);
  if (share !== null) {
    return share;
  }
  return STRONG_MODE.test(mode) ? 1 : RESTING_LEVEL;
}

function powerOf(lookup: Lookup): VisualPower {
  const power = flagOf(lookup, 'power');
  if (power === null) {
    return 'unknown';
  }
  return power ? 'on' : 'off';
}

function thermalOf(lookup: Lookup, family: DeviceFamily, power: VisualPower): ThermalMode {
  if (power === 'off') {
    return 'idle';
  }
  const mode = textOf(lookup, 'hvac_mode') ?? '';
  if (/heat/i.test(mode) || (mode === '' && family === 'heater')) {
    return 'heat';
  }
  if (/cool/i.test(mode) || (mode === '' && family === 'air_conditioner')) {
    return 'cool';
  }
  return 'idle';
}

function colourOf(lookup: Lookup): string | null {
  const colour = hsvCss(valueOf(lookup, 'color'));
  if (colour !== null) {
    return colour;
  }
  const temperature = numberOf(lookup, 'color_temperature');
  if (temperature === null || temperature <= 0) {
    return null;
  }
  return kelvinCss(temperature < 1000 ? 1_000_000 / temperature : temperature);
}

function waterLowOf(lookup: Lookup): boolean {
  if (flagOf(lookup, 'tank_empty') === true) {
    return true;
  }
  return NO_WATER.test(textOf(lookup, 'fault') ?? '');
}

function bandOf(lookup: Lookup): VisualState['band'] {
  const pm25 = numberOf(lookup, 'pm25');
  return pm25 === null ? null : airBand(pm25);
}

function airFields(
  lookup: Lookup,
): Pick<VisualState, 'band' | 'target' | 'targetShare' | 'current'> {
  return {
    band: bandOf(lookup),
    target: numberOf(lookup, 'target_temperature') ?? numberOf(lookup, 'target_humidity'),
    targetShare: shareOf(lookup, 'target_temperature') ?? shareOf(lookup, 'target_humidity'),
    current: numberOf(lookup, 'temperature') ?? numberOf(lookup, 'humidity'),
  };
}

function motionFields(lookup: Lookup): Pick<VisualState, 'oscillating' | 'angle'> {
  return {
    oscillating: flagOf(lookup, 'oscillation') === true,
    angle: numberOf(lookup, 'swing_angle'),
  };
}

function waterFields(lookup: Lookup): Pick<VisualState, 'waterLow' | 'waterLevel'> {
  return { waterLow: waterLowOf(lookup), waterLevel: shareOf(lookup, 'water_level') };
}

function positionFields(lookup: Lookup): Pick<VisualState, 'locked' | 'position'> {
  return { locked: flagOf(lookup, 'lock'), position: shareOf(lookup, 'cover_position') };
}

export function visualStateOf(device: VisualDevice, values: ObservedValues): VisualState {
  const lookup = lookupOf(device, values);
  const family = deviceFamily(device);
  const power = powerOf(lookup);
  return {
    power,
    online: device.online || sleepsBetweenUse(device),
    level: levelOf(lookup),
    ...airFields(lookup),
    ...motionFields(lookup),
    ...waterFields(lookup),
    ...positionFields(lookup),
    colour: colourOf(lookup),
    thermal: thermalOf(lookup, family, power),
    progress: null,
    battery: numberOf(lookup, 'battery'),
    pulse: null,
    syncing: false,
    load: shareOf(lookup, 'power_draw'),
    reading: readingOf(lookup, SENSOR_READINGS),
    source: readingOf(lookup, SOURCE_ROLES)?.text ?? null,
    presence: flagOf(lookup, 'occupancy') ?? flagOf(lookup, 'motion'),
  };
}
