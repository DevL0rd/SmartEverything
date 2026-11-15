import {
  CAPABILITY_CATALOGUE,
  DEVICE_CAPABILITY,
  isStandardCapability,
  type AccessMode,
  type DeviceCapability,
  type JsonValue,
  type StandardCapability,
  type ValueDescriptor,
} from '@smarteverything/domain';

type Range = readonly [number, number, number, string?];

const RANGES: Readonly<Record<string, Range>> = {
  brightness: [0, 100, 1, '%'],
  color_temperature: [2000, 6500, 100, 'K'],
  temperature: [-20, 60, 0.1, '°C'],
  target_temperature: [16, 30, 0.5, '°C'],
  humidity: [0, 100, 1, '%'],
  target_humidity: [30, 80, 1, '%'],
  water_level: [0, 100, 1, '%'],
  pm25: [0, 500, 1, 'µg/m³'],
  pm10: [0, 500, 1, 'µg/m³'],
  co2: [300, 5000, 1, 'ppm'],
  tvoc: [0, 3000, 1, 'ppb'],
  filter_life: [0, 100, 1, '%'],
  battery: [0, 100, 1, '%'],
  illuminance: [0, 20000, 1, 'lx'],
  volume: [0, 100, 1, '%'],
  fan_speed: [0, 100, 1, '%'],
  cover_position: [0, 100, 1, '%'],
  power_draw: [0, 3500, 0.1, 'W'],
  energy: [0, 100000, 0.01, 'kWh'],
  voltage: [0, 300, 0.1, 'V'],
  signal_strength: [-100, 0, 1, 'dBm'],
  storage_free: [0, 100, 1, '%'],
  zoom: [1, 10, 0.1],
  channel: [0, 999, 1],
  off_timer: [0, 720, 1, 'min'],
};

const OPTIONS: Readonly<Record<string, readonly string[]>> = {
  hvac_mode: ['cool', 'heat', 'dry', 'auto', 'fan_only'],
  fan_mode: ['auto', 'low', 'medium', 'high'],
  purifier_mode: ['auto', 'sleep', 'favorite'],
  mist_level: ['low', 'medium', 'high'],
  cleaning: ['idle', 'cleaning', 'docked', 'returning', 'paused'],
  suction: ['quiet', 'standard', 'turbo', 'max'],
  mop_level: ['off', 'low', 'medium', 'high'],
  playback: ['play', 'pause', 'stop'],
  recording: ['off', 'events', 'continuous'],
  illumination: ['dark', 'twilight', 'bright'],
  button: ['single', 'double', 'long'],
  night_vision: ['auto', 'on', 'off'],
  motion_sensitivity: ['low', 'medium', 'high'],
  alarm: ['disarmed', 'home', 'away'],
  input_source: ['hdmi1', 'hdmi2', 'tv', 'apps'],
  cover_action: ['open', 'close', 'stop'],
  swing: ['off', 'vertical', 'horizontal', 'both'],
  display_brightness: ['off', 'dim', 'bright'],
  light_effect: ['none', 'candle', 'sunrise', 'party'],
  ptz_preset: ['home', 'door', 'window'],
  call_status: ['idle', 'ringing', 'active'],
  remote_key: ['up', 'down', 'left', 'right', 'ok', 'back'],
  app_launch: ['netflix', 'youtube', 'music'],
};

function descriptorOf(key: StandardCapability): ValueDescriptor {
  const kind = CAPABILITY_CATALOGUE[key].kind;
  switch (kind) {
    case 'boolean':
      return { kind: 'boolean' };
    case 'color':
      return { kind: 'color' };
    case 'text':
      return { kind: 'text', maxLength: 200 };
    case 'action':
      return { kind: 'action' };
    case 'enum':
      return { kind: 'enum', options: [...(OPTIONS[key] ?? ['a', 'b'])] };
    case 'number': {
      const [min, max, step, unit] = RANGES[key] ?? [0, 100, 1];
      return { kind: 'number', min, max, step, ...(unit === undefined ? {} : { unit }) };
    }
  }
}

export function capability(key: string, access: AccessMode): DeviceCapability {
  if (!isStandardCapability(key)) throw new Error(`${key} is not a catalogue capability.`);
  return DEVICE_CAPABILITY.parse({
    key,
    label: CAPABILITY_CATALOGUE[key].label,
    access,
    value: descriptorOf(key),
  });
}

export type Behaviour =
  | {
      readonly kind: 'series';
      readonly base: number;
      readonly swing: number;
      readonly noise: number;
    }
  | {
      readonly kind: 'toggle';
      readonly perDay: number;
      readonly start: number;
      readonly end: number;
    }
  | { readonly kind: 'fixed'; readonly value: JsonValue };

export interface CapabilitySpec {
  readonly key: string;
  readonly access: AccessMode;
  readonly behaviour: Behaviour;
}

export interface DeviceSpec {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly room: string;
  readonly model: string;
  readonly manufacturer: string;
  readonly capabilities: readonly CapabilitySpec[];
  readonly details?: Readonly<Record<string, JsonValue>>;
}
