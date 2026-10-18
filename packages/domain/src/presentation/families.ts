import type { CapabilityRole, DeviceFamily, PresentedCapability } from './types';

export type GlowTone = 'primary' | 'humidity' | 'temp-cool' | 'temp-warm';

export interface SummaryPart {
  readonly role: CapabilityRole;
  readonly prefix: string;
}

export interface FamilyDefinition {
  readonly cardRoles: readonly CapabilityRole[];
  readonly levelRoles: readonly CapabilityRole[];
  readonly summary: readonly SummaryPart[];
  readonly glow: GlowTone | null;
}

const LEVEL_TEXT_ROLES: readonly CapabilityRole[] = [
  'fan_mode',
  'favourite_level',
  'fan_speed',
  'mist_level',
  'brightness',
  'volume',
];

const FAN: readonly CapabilityRole[] = ['fan_speed', 'mode', 'oscillation', 'swing_angle'];

const MEDIA: readonly CapabilityRole[] = [
  'volume',
  'input_source',
  'app_launch',
  'mute',
  'channel',
];

const DEFAULT_DEFINITION: FamilyDefinition = {
  cardRoles: [],
  levelRoles: LEVEL_TEXT_ROLES,
  summary: [],
  glow: 'primary',
};

function define(overrides: Partial<FamilyDefinition>): FamilyDefinition {
  return { ...DEFAULT_DEFINITION, ...overrides };
}

const FAMILY_DEFINITIONS: Partial<Readonly<Record<DeviceFamily, FamilyDefinition>>> = {
  air_purifier: define({ cardRoles: ['purifier_mode', 'favourite_level', 'fan_mode'] }),
  humidifier: define({ cardRoles: ['target_humidity', 'mode', 'mist_level'], glow: 'humidity' }),
  diffuser: define({
    cardRoles: ['spray', 'spray_interval', 'spray_duration', 'ambient_light', 'brightness'],
    levelRoles: [],
    summary: [
      { role: 'spray_duration', prefix: '' },
      { role: 'spray_interval', prefix: 'every ' },
    ],
    glow: null,
  }),
  dehumidifier: define({ glow: 'humidity' }),
  tower_fan: define({ cardRoles: FAN, glow: 'temp-cool' }),
  fan: define({ cardRoles: FAN, glow: 'temp-cool' }),
  heater: define({ glow: 'temp-warm' }),
  air_conditioner: define({ glow: 'temp-cool' }),
  thermostat: define({ glow: 'temp-warm' }),
  light: define({ cardRoles: ['brightness', 'color_temperature'], glow: 'temp-warm' }),
  television: define({ cardRoles: MEDIA, summary: [{ role: 'current_app', prefix: '' }] }),
  speaker: define({ cardRoles: MEDIA }),
};

export function familyDefinition(family: DeviceFamily): FamilyDefinition {
  return FAMILY_DEFINITIONS[family] ?? DEFAULT_DEFINITION;
}

const LIVE_ROLES: ReadonlySet<CapabilityRole> = new Set([
  'brightness',
  'color',
  'color_temperature',
]);

export function isLiveControl(
  presented: Pick<PresentedCapability, 'role' | 'colorEncoding' | 'capability'>,
): boolean {
  return (
    (presented.role !== null && LIVE_ROLES.has(presented.role)) ||
    presented.colorEncoding !== undefined ||
    presented.capability.value.kind === 'color'
  );
}

const BLE_OBSERVABLE_MODELS: ReadonlySet<string> = new Set(['isa.magnet.dw2hl']);

export function isBleObservable(device: {
  readonly provider: string;
  readonly model: string;
}): boolean {
  return device.provider === 'xiaomi' && BLE_OBSERVABLE_MODELS.has(device.model);
}
