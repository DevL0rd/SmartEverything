import {
  PHONE_CONTEXT_STATES,
  PHONE_FLASHLIGHT_MODES,
  PHONE_NETWORKS,
  PHONE_PLAYBACK,
  PHONE_RINGER_MODES,
  type DeviceCapability,
  type DiscoveredDevice,
  type StandardCapability,
} from '@smarteverything/domain';
import { driverDeviceId, driverIdOf, DRIVER_ID_SEPARATOR } from '../local/device-driver';

export const PHONE_DRIVER = 'phone';

export const PHONE_MODEL = 'smarteverything.android';

const PERCENT = { kind: 'number', min: 0, max: 100, step: 1, unit: '%' } as const;

const MINUTES_PER_DAY = 1440;

const NOW_PLAYING_LONGEST = 300;

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
    access: 'write',
    value: { kind: 'enum', options: [...PHONE_FLASHLIGHT_MODES] },
  },
];

const REPORTED: ReadonlySet<string> = new Set(
  PHONE_CAPABILITIES.map((capability) => capability.key),
);

export function isPhoneCapability(key: string): key is StandardCapability {
  return REPORTED.has(key);
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

export function describePhone(phone: PhoneIdentity): DiscoveredDevice {
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
    capabilities: [...PHONE_CAPABILITIES],
    details: { clientId: phone.clientId, profileId: phone.profileId },
  };
}
