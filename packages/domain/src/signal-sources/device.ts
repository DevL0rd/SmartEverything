import { CAPABILITY_CATALOGUE } from '../capabilities';
import { DEVICE_KINDS, PROVIDERS } from '../devices';
import { humanizeEnum } from '../presentation/humanize';
import { DEVICE_FAMILIES, EXTRA_ROLES } from '../presentation/types';
import { DEVICE_COMMAND_SIGNAL } from './device-command';
import type { SignalMatchSpec, SignalSourceSpec } from './spec';

export const DEVICE_STATE_CAUSES = [
  'physical',
  'app',
  'assistant',
  'automation',
  'schedule',
] as const;

export type DeviceStateCause = (typeof DEVICE_STATE_CAUSES)[number];

export const DEVICE_LIFECYCLE_CHANGES = [
  'added',
  'removed',
  'renamed',
  'moved',
  'replaced',
  'capabilities_changed',
  'firmware_changed',
] as const;

export type DeviceLifecycleChange = (typeof DEVICE_LIFECYCLE_CHANGES)[number];

const CAUSE_LABELS: Readonly<Record<DeviceStateCause, string>> = {
  physical: 'Someone used the device itself',
  app: 'Someone used the app',
  assistant: 'The assistant',
  automation: 'An automation',
  schedule: 'A schedule',
};

const LIFECYCLE_LABELS: Readonly<Record<DeviceLifecycleChange, string>> = {
  added: 'Added to the home',
  removed: 'Removed from the home',
  renamed: 'Renamed',
  moved: 'Moved to another room',
  replaced: 'Replaced by other hardware',
  capabilities_changed: 'Gained or lost features',
  firmware_changed: 'Firmware changed',
};

const DEVICE_ROLES: readonly string[] = [
  ...new Set([...Object.keys(CAPABILITY_CATALOGUE), ...EXTRA_ROLES]),
];

function enumMatch(
  key: string,
  label: string,
  values: readonly string[],
  labels: Readonly<Record<string, string>> | null = null,
): SignalMatchSpec {
  return {
    key,
    label,
    values,
    valueLabels: Object.fromEntries(
      values.map((value) => [value, labels?.[value] ?? humanizeEnum(value)]),
    ),
  };
}

const DEVICE_FACT_MATCH: readonly SignalMatchSpec[] = [
  enumMatch('family', 'Kind of device', DEVICE_FAMILIES),
  enumMatch('kind', 'Device type', DEVICE_KINDS),
  { key: 'roomId', label: 'Room', values: null },
  enumMatch('provider', 'Where the device comes from', PROVIDERS),
  { key: 'name', label: 'Device name', values: null },
];

const STATE_MATCH: readonly SignalMatchSpec[] = [
  ...DEVICE_FACT_MATCH,
  enumMatch('role', 'What the value is', DEVICE_ROLES),
  { key: 'unit', label: 'Unit of the value', values: null },
  enumMatch('cause', 'What changed it', DEVICE_STATE_CAUSES, CAUSE_LABELS),
];

const LIFECYCLE_MATCH: readonly SignalMatchSpec[] = [
  enumMatch('change', 'What happened to the device', DEVICE_LIFECYCLE_CHANGES, LIFECYCLE_LABELS),
  ...DEVICE_FACT_MATCH,
];

export const DEVICE_SIGNALS: SignalSourceSpec = {
  source: 'device',
  label: 'Devices',
  kinds: [
    {
      kind: 'state',
      label: 'A device value changes',
      subject: 'device',
      fields: 'capabilities',
      match: STATE_MATCH,
      pulse: false,
      feed: false,
    },
    {
      kind: 'online',
      label: 'A device goes online or offline',
      subject: 'device',
      fields: [],
      match: DEVICE_FACT_MATCH,
      pulse: false,
      states: { on: 'online', off: 'offline' },
      feed: false,
    },
    {
      kind: 'lifecycle',
      label: 'A device is added, removed or changed',
      subject: 'device',
      fields: [],
      match: LIFECYCLE_MATCH,
      pulse: true,
      feed: true,
    },
    DEVICE_COMMAND_SIGNAL,
  ],
};
