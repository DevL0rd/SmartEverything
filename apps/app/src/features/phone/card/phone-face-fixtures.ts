import {
  UNSET_FITNESS_GOALS,
  type DeviceCapability,
  type JsonValue,
  type ProfileRow,
} from '@smarteverything/domain';
import { deviceFixture, stateFixture } from '../../../store/device-fixture';
import { makeTable, type Device, type DeviceValues, type StoreState } from '../../../store/state';

export const PHONE_DEVICE = '00000000-0000-4000-8000-0000000000a1';
export const PHONE_PROFILE = '00000000-0000-4000-8000-0000000000b1';
export const OTHER_PROFILE = '00000000-0000-4000-8000-0000000000b2';
export const THIS_CLIENT = '00000000-0000-4000-8000-0000000000c1';
export const OTHER_CLIENT = '00000000-0000-4000-8000-0000000000c2';
export const OBSERVED = '2026-10-18T10:00:00.000Z';

const PERCENT = { kind: 'number', min: 0, max: 100, step: 1, unit: '%' } as const;

function entry(
  key: DeviceCapability['key'],
  access: DeviceCapability['access'],
  value: DeviceCapability['value'],
): DeviceCapability {
  return { key, label: key, access, value };
}

const CAPABILITIES: readonly DeviceCapability[] = [
  entry('battery', 'read', PERCENT),
  entry('charging', 'read', { kind: 'boolean' }),
  entry('network', 'read', { kind: 'enum', options: ['wifi', 'cellular', 'offline'] }),
  entry('ringer_mode', 'read_write', { kind: 'enum', options: ['normal', 'vibrate', 'silent'] }),
  entry('dnd', 'read_write', { kind: 'boolean' }),
  entry('volume', 'read_write', PERCENT),
  entry('playback', 'read_write', { kind: 'enum', options: ['playing', 'paused', 'stopped'] }),
  entry('now_playing', 'read', { kind: 'text', maxLength: 300 }),
  entry('screen_on', 'read', { kind: 'boolean' }),
  entry('ring', 'write', { kind: 'action' }),
  entry('stop_ring', 'write', { kind: 'action' }),
  entry('flashlight', 'read_write', { kind: 'enum', options: ['on', 'off', 'toggle'] }),
];

export type PhoneReadingsInput = Readonly<Record<string, JsonValue>>;

export const DEFAULT_READINGS: PhoneReadingsInput = {
  battery: 62,
  charging: false,
  network: 'wifi',
  signal_strength: 3,
  ringer_mode: 'normal',
  dnd: false,
  volume: 40,
  playback: 'paused',
  screen_on: true,
  phone_context: 'walking',
  screen_time_today: 192,
  notification_count: 4,
  flashlight: 'off',
};

export function phoneDevice(overrides: {
  readonly online?: boolean;
  readonly profileId?: string;
  readonly clientId?: string;
  readonly features?: readonly JsonValue[];
  readonly name?: string;
}): Device {
  return deviceFixture(0, {
    id: PHONE_DEVICE,
    kind: 'phone',
    model: 'smarteverything.android',
    name: overrides.name ?? 'Dana’s Fold7',
    online: overrides.online ?? true,
    capabilities: [...CAPABILITIES],
    details: {
      clientId: overrides.clientId ?? THIS_CLIENT,
      profileId: overrides.profileId ?? PHONE_PROFILE,
      phoneFeatures: [...(overrides.features ?? [])],
    },
  });
}

export function observed(readings: PhoneReadingsInput, at = OBSERVED): DeviceValues {
  return Object.fromEntries(
    Object.entries(readings).map(([key, value]) => [key, { value, observedAt: at }]),
  );
}

export function sessionOf(
  profileId: string,
  role: 'owner' | 'member',
): NonNullable<StoreState['session']> {
  return {
    client: {
      id: THIS_CLIENT,
      name: 'Dana’s phone',
      platform: 'android',
      role,
      built_in: false,
      profile_id: profileId,
      created_at: OBSERVED,
      last_seen_at: null,
    },
    hub: { version: '1', startedAt: OBSERVED, cameras: 'running' },
  };
}

function profile(id: string, name: string, position: number): ProfileRow {
  return {
    id,
    name,
    colour: 'amber',
    sex: null,
    birth_date: null,
    height_cm: null,
    scale_user: null,
    fitness_goals: UNSET_FITNESS_GOALS,
    max_heart_rate: null,
    position,
    created_at: OBSERVED,
    updated_at: OBSERVED,
  };
}

export interface Viewer {
  readonly profileId: string;
  readonly role: 'owner' | 'member';
}

export const OWNER_DANA: Viewer = { profileId: PHONE_PROFILE, role: 'owner' };

export function phoneStore(
  device: Device,
  readings: PhoneReadingsInput,
  viewer: Viewer = OWNER_DANA,
): StoreState {
  const base = stateFixture([device], { [device.id]: observed(readings) });
  const profiles = [profile(PHONE_PROFILE, 'Dana', 0), profile(OTHER_PROFILE, 'Sam', 1)];
  return {
    ...base,
    tables: {
      ...base.tables,
      profiles: makeTable(
        Object.fromEntries(profiles.map((row) => [row.id, row])),
        profiles.map((row) => row.id),
        1,
      ),
    },
    loaded: true,
    session: sessionOf(viewer.profileId, viewer.role),
  };
}
