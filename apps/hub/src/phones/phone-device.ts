import {
  PHONE_AUDIO_OUTPUTS,
  PHONE_CHARGERS,
  PHONE_CONTEXT_STATES,
  PHONE_FLASHLIGHT_MODES,
  PHONE_NETWORKS,
  PHONE_PLAYBACK,
  PHONE_RINGER_MODES,
  PHONE_SCREEN_TIMEOUT_OPTIONS,
  PHONE_SETTINGS_PAGES,
  PHONE_SIGNAL_BARS_MOST,
  PHONE_THERMAL_STATES,
  type DeviceCapability,
  type PhoneFeatureSupport,
  type DiscoveredDevice,
  type MachineAction,
  type MachineActionSupport,
  type MachinePermissionState,
  type StandardCapability,
} from '@smarteverything/domain';
import { driverDeviceId, driverIdOf, DRIVER_ID_SEPARATOR } from '../local/device-driver';
import { machineCapabilities } from '../machines/machine-capabilities';

export const PHONE_DRIVER = 'phone';

const PHONE_MODEL = 'smarteverything.android';

const PERCENT = { kind: 'number', min: 0, max: 100, step: 1, unit: '%' } as const;

const MINUTES_PER_DAY = 1440;

const NOW_PLAYING_LONGEST = 300;

const MOMENT_LONGEST = 40;

const TEMPERATURE = { kind: 'number', min: -40, max: 120, step: 0.5, unit: '°C' } as const;

export const PHONE_CAPABILITIES: readonly DeviceCapability[] = [
  { key: 'battery', label: 'Battery', access: 'read', value: PERCENT },
  { key: 'charging', label: 'Charging', access: 'read', value: { kind: 'boolean' } },
  {
    key: 'phone_context',
    label: 'Doing',
    access: 'read',
    value: { kind: 'enum', options: [...PHONE_CONTEXT_STATES] },
  },
  {
    key: 'network',
    label: 'Network',
    access: 'read',
    value: { kind: 'enum', options: [...PHONE_NETWORKS] },
  },
  {
    key: 'ringer_mode',
    label: 'Ringer',
    access: 'read_write',
    value: { kind: 'enum', options: [...PHONE_RINGER_MODES] },
  },
  { key: 'dnd', label: 'Do Not Disturb', access: 'read_write', value: { kind: 'boolean' } },
  { key: 'volume', label: 'Media volume', access: 'read_write', value: PERCENT },
  {
    key: 'playback',
    label: 'Playback',
    access: 'read_write',
    value: { kind: 'enum', options: [...PHONE_PLAYBACK] },
  },
  {
    key: 'now_playing',
    label: 'Now playing',
    access: 'read',
    value: { kind: 'text', maxLength: NOW_PLAYING_LONGEST },
  },
  {
    key: 'screen_time_today',
    label: 'Screen time today',
    access: 'read',
    value: { kind: 'number', min: 0, max: MINUTES_PER_DAY, step: 1, unit: 'min' },
  },
  { key: 'screen_on', label: 'Screen on', access: 'read', value: { kind: 'boolean' } },
  { key: 'ring', label: 'Ring', access: 'write', value: { kind: 'action' } },
  {
    key: 'flashlight',
    label: 'Flashlight',
    access: 'read_write',
    value: { kind: 'enum', options: [...PHONE_FLASHLIGHT_MODES] },
  },
  {
    key: 'charger',
    label: 'Charger',
    access: 'read',
    value: { kind: 'enum', options: [...PHONE_CHARGERS] },
  },
  {
    key: 'charge_full_at',
    label: 'Full at',
    access: 'read',
    value: { kind: 'text', maxLength: MOMENT_LONGEST },
  },
  { key: 'battery_temperature', label: 'Battery temperature', access: 'read', value: TEMPERATURE },
  { key: 'power_save', label: 'Battery saver', access: 'read', value: { kind: 'boolean' } },
  {
    key: 'thermal_state',
    label: 'Heat',
    access: 'read',
    value: { kind: 'enum', options: [...PHONE_THERMAL_STATES] },
  },
  { key: 'ring_volume', label: 'Ring volume', access: 'read_write', value: PERCENT },
  { key: 'alarm_volume', label: 'Alarm volume', access: 'read_write', value: PERCENT },
  {
    key: 'notification_volume',
    label: 'Notification volume',
    access: 'read_write',
    value: PERCENT,
  },
  {
    key: 'audio_output',
    label: 'Sound output',
    access: 'read',
    value: { kind: 'enum', options: [...PHONE_AUDIO_OUTPUTS] },
  },
  { key: 'in_call', label: 'In a call', access: 'read', value: { kind: 'boolean' } },
  { key: 'brightness', label: 'Brightness', access: 'read_write', value: PERCENT },
  {
    key: 'auto_brightness',
    label: 'Auto brightness',
    access: 'read_write',
    value: { kind: 'boolean' },
  },
  { key: 'ringing', label: 'Ringing', access: 'read', value: { kind: 'boolean' } },
  {
    key: 'storage_free',
    label: 'Storage free',
    access: 'read',
    value: { kind: 'number', min: 0, max: Number.MAX_SAFE_INTEGER, step: 1, unit: 'B' },
  },
  {
    key: 'notification_count',
    label: 'Notifications',
    access: 'read',
    value: { kind: 'number', min: 0, max: Number.MAX_SAFE_INTEGER, step: 1 },
  },
  {
    key: 'next_alarm',
    label: 'Next alarm',
    access: 'read',
    value: { kind: 'text', maxLength: MOMENT_LONGEST },
  },
  {
    key: 'signal_strength',
    label: 'Signal',
    access: 'read',
    value: { kind: 'number', min: 0, max: PHONE_SIGNAL_BARS_MOST, step: 1, unit: 'bars' },
  },
  {
    key: 'screen_timeout',
    label: 'Screen timeout (seconds)',
    access: 'read_write',
    value: { kind: 'enum', options: [...PHONE_SCREEN_TIMEOUT_OPTIONS] },
  },
  { key: 'auto_rotate', label: 'Auto-rotate', access: 'read_write', value: { kind: 'boolean' } },
  {
    key: 'haptic_feedback',
    label: 'Touch vibration',
    access: 'read_write',
    value: { kind: 'boolean' },
  },
  { key: 'touch_sounds', label: 'Touch sounds', access: 'read_write', value: { kind: 'boolean' } },
  { key: 'wifi_on', label: 'Wi-Fi', access: 'read', value: { kind: 'boolean' } },
  { key: 'bluetooth_on', label: 'Bluetooth', access: 'read', value: { kind: 'boolean' } },
  { key: 'location_on', label: 'Location', access: 'read', value: { kind: 'boolean' } },
  { key: 'airplane_mode', label: 'Airplane mode', access: 'read', value: { kind: 'boolean' } },
  {
    key: 'open_settings',
    label: 'Open phone settings',
    access: 'write',
    value: { kind: 'enum', options: [...PHONE_SETTINGS_PAGES] },
  },
];

export const PHONE_REPORTED_ACTIONS: readonly MachineAction[] = [
  'stop_ring',
  'lock',
  'show_unlock',
  'launch_app',
  'open',
];

const REPORTED: ReadonlySet<string> = new Set(
  PHONE_CAPABILITIES.map((capability) => capability.key),
);

export function isPhoneCapability(key: string): key is StandardCapability {
  return REPORTED.has(key);
}

export interface PhoneMachine {
  readonly actions: readonly MachineActionSupport[];
  readonly permissions: readonly MachinePermissionState[];
  readonly features: readonly PhoneFeatureSupport[];
}

export function phoneExternalId(clientId: string): string {
  return driverDeviceId(PHONE_DRIVER, clientId);
}

export function clientIdOfPhone(externalId: string): string | null {
  return driverIdOf(externalId) === PHONE_DRIVER
    ? externalId.slice(PHONE_DRIVER.length + DRIVER_ID_SEPARATOR.length)
    : null;
}

export interface PhoneIdentity {
  readonly clientId: string;
  readonly name: string;
  readonly profileId: string;
}

export function describePhone(phone: PhoneIdentity, machine: PhoneMachine): DiscoveredDevice {
  return {
    provider: 'local',
    externalId: phoneExternalId(phone.clientId),
    parentExternalId: null,
    kind: 'phone',
    name: phone.name,
    model: PHONE_MODEL,
    manufacturer: 'Android',
    room: null,
    online: true,
    capabilities: [
      ...PHONE_CAPABILITIES,
      ...machineCapabilities(machine.actions, PHONE_REPORTED_ACTIONS),
    ],
    details: {
      clientId: phone.clientId,
      profileId: phone.profileId,
      machineActions: machine.actions.map((support) => ({ ...support })),
      machinePermissions: machine.permissions.map((state) => ({ ...state })),
      phoneFeatures: machine.features.map((support) => ({ ...support })),
    },
  };
}
