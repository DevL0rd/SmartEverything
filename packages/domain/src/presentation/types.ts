import type { CapabilityGroup, CapabilityKey, StandardCapability } from '../capabilities';
import type { DeviceCapability, DeviceKind } from '../devices';

export const PRESENTATION_TIERS = [
  'primary',
  'control',
  'reading',
  'maintenance',
  'setting',
  'extra',
  'diagnostic',
  'hidden',
] as const;

export type PresentationTier = (typeof PRESENTATION_TIERS)[number];

export type Danger =
  | { readonly tier: 'none' }
  | { readonly tier: 'confirm' }
  | { readonly tier: 'typed'; readonly word: string };

export const EXTRA_ROLES = [
  'mode',
  'swing_angle',
  'rotate_left',
  'rotate_right',
  'favourite_level',
  'manual_level',
  'fault',
  'filter_days_left',
  'off_timer_enabled',
  'restart',
  'format_storage',
  'self_clean',
  'detect_people',
  'follow_people',
  'follow_pets',
  'smart_zoom',
  'spray',
  'spray_duration',
  'spray_interval',
  'ambient_light',
  'auto_fragrance',
  'auto_light',
  'light_auto_off',
  'charging_state',
  'cooking_state',
] as const;

export type ExtraRole = (typeof EXTRA_ROLES)[number];

export type CapabilityRole = StandardCapability | ExtraRole;

export const DEVICE_FAMILIES = [
  'air_purifier',
  'humidifier',
  'diffuser',
  'microwave',
  'dehumidifier',
  'tower_fan',
  'fan',
  'heater',
  'air_conditioner',
  'thermostat',
  'light',
  'switch',
  'plug',
  'sensor',
  'camera',
  'doorbell',
  'scale',
  'wearable',
  'television',
  'speaker',
  'lock',
  'cover',
  'vacuum',
  'ir_blaster',
  'ir_remote',
  'gateway',
  'computer',
  'phone',
  'router',
  'file_sync',
  'dns_filter',
  'robot',
  'generic',
] as const;

export type DeviceFamily = (typeof DEVICE_FAMILIES)[number];

export interface CapabilityOverride {
  readonly label: string;
  readonly tier: PresentationTier;
  readonly role?: CapabilityRole;
  readonly group?: CapabilityGroup;
  readonly groupLabel?: string;
  readonly options?: Readonly<Record<string, string>>;
  readonly unit?: string;
  readonly danger?: Danger;
  readonly readOnly?: true;
  readonly states?: BooleanStates;
  readonly clock?: ClockText;
  readonly colorEncoding?: ColorEncoding;
  readonly keywords?: readonly string[];
}

export type ColorEncoding = 'packed_rgb';

export type ClockText = 'minutes' | 'seconds';

export type BooleanStates = readonly [on: string, off: string];

export type CapabilityOverrides = Readonly<Record<string, CapabilityOverride>>;

export interface ModelOverride {
  readonly family: DeviceFamily;
  readonly capabilities: CapabilityOverrides;
}

export interface PresentableDevice {
  readonly kind: DeviceKind;
  readonly model: string;
}

export interface PresentableDeviceWithCapabilities extends PresentableDevice {
  readonly capabilities: readonly DeviceCapability[];
}

export interface EnumOption {
  readonly value: string;
  readonly label: string;
}

export interface CapabilityPresentation {
  readonly key: CapabilityKey;
  readonly label: string;
  readonly group: CapabilityGroup;
  readonly groupLabel: string;
  readonly tier: PresentationTier;
  readonly role: CapabilityRole | null;
  readonly danger: Danger;
  readonly writable: boolean;
  readonly options: readonly EnumOption[];
  readonly unit: string | null;
  readonly states: BooleanStates | null;
  readonly clock: ClockText | null;
  readonly colorEncoding?: ColorEncoding;
  readonly keywords?: readonly string[];
}

export interface PresentedCapability extends CapabilityPresentation {
  readonly capability: DeviceCapability;
}

export interface DevicePresentation {
  readonly family: DeviceFamily;
  readonly capabilities: readonly PresentedCapability[];
}
