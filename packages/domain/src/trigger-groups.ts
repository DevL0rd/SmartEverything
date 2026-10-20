import { EVENT_KINDS, type EventKind } from './events';
import type { DeviceFamily } from './presentation/types';
import { PLUGIN_SOURCE_PREFIX } from './signal-sources/rates';

export const TRIGGER_GROUPS = [
  'devices',
  'rooms',
  'people',
  'cameras',
  'voice',
  'ai',
  'health',
  'computers',
  'network',
  'hub',
  'time',
  'automations',
  'records',
] as const;

export type TriggerGroup = (typeof TRIGGER_GROUPS)[number];

export const TRIGGER_GROUP_LABELS: Readonly<Record<TriggerGroup, string>> = {
  devices: 'Devices by room',
  rooms: 'Rooms and groups',
  people: 'People and presence',
  cameras: 'Cameras and doorbells',
  voice: 'Voice, calls and walkie',
  ai: 'AI and budget',
  health: 'Health and fitness',
  computers: 'Computers, phones and watches',
  network: 'Network and plugins',
  hub: 'Home hub and providers',
  time: 'Time, sun and weather',
  automations: 'Automations and schedules',
  records: 'Everything else',
};

const SOURCE_GROUPS: Readonly<Record<string, TriggerGroup>> = {
  device: 'devices',
  group: 'rooms',
  presence: 'people',
  access: 'people',
  camera: 'cameras',
  listening: 'voice',
  call: 'voice',
  talk: 'voice',
  assistant: 'ai',
  budget: 'ai',
  health: 'health',
  computer: 'computers',
  phone: 'computers',
  watch: 'computers',
  hub: 'hub',
  provider: 'hub',
  notification: 'hub',
  weather: 'time',
  schedule: 'automations',
  automation_run: 'automations',
  automation_value: 'automations',
  record: 'records',
};

const EVENT_GROUPS: Readonly<Record<EventKind, TriggerGroup>> = {
  doorbell: 'cameras',
  call: 'cameras',
  motion: 'cameras',
  no_motion: 'cameras',
  person: 'cameras',
  sound: 'cameras',
  pet: 'cameras',
  alarm: 'devices',
  button: 'devices',
  leak: 'devices',
  smoke: 'devices',
  device_online: 'devices',
  device_offline: 'devices',
  opened: 'devices',
  maintenance: 'devices',
  fault: 'devices',
  activity: 'devices',
  cycle_finished: 'devices',
  automation_run: 'automations',
  provider_error: 'hub',
  computer_power: 'computers',
  machine_action: 'computers',
  phone_context_changed: 'computers',
  phone_unlocked: 'computers',
  app_opened: 'computers',
  app_closed: 'computers',
  app_focused: 'computers',
  app_unfocused: 'computers',
  place_arrived: 'people',
  place_left: 'people',
  parked: 'people',
  zone_enter: 'people',
  zone_leave: 'people',
  signal: 'records',
};

const FAMILY_GROUPS: Readonly<Partial<Record<DeviceFamily, TriggerGroup>>> = {
  camera: 'cameras',
  doorbell: 'cameras',
  computer: 'computers',
  phone: 'computers',
  wearable: 'computers',
  router: 'network',
  dns_filter: 'network',
  file_sync: 'network',
};

export function sourceGroup(source: string, kind: string): TriggerGroup {
  if (source === 'event') {
    const eventKind = EVENT_KINDS.find((candidate) => candidate === kind);
    return eventKind === undefined ? 'devices' : EVENT_GROUPS[eventKind];
  }
  if (source.startsWith(PLUGIN_SOURCE_PREFIX)) {
    return 'network';
  }
  return SOURCE_GROUPS[source] ?? 'records';
}

export function deviceGroup(family: DeviceFamily): TriggerGroup {
  return FAMILY_GROUPS[family] ?? 'devices';
}
