import type { StandardCapability } from './capabilities';
import type { DeviceCapability } from './devices';
import type { JsonValue } from './values';

export const UNLOAD_PENDING_KEY = 'raw:unload_pending';

export const UNLOAD_PENDING_CAPABILITY: DeviceCapability = {
  key: UNLOAD_PENDING_KEY,
  label: 'Waiting to be unloaded',
  access: 'read',
  value: { kind: 'boolean' },
};

export const LAUNDRY_ROLES = [
  'laundry_status',
  'laundry_phase',
  'laundry_phases',
  'laundry_program',
  'laundry_dial',
  'remaining_minutes',
  'door_state',
  'door_release',
  'cycle_start',
  'cycle_pause',
  'cycle_stop',
  'wash_temperature',
  'spin_speed',
  'rinse_count',
  'wash_minutes',
  'soak_minutes',
  'dry_mode',
  'dry_minutes',
  'dry_target',
  'steam_hygiene',
  'extra_water',
  'quiet_mode',
  'anti_crease_minutes',
  'anti_crease_waiting',
  'anti_crease_start',
  'anti_crease_stop',
  'smart_mode',
  'one_click',
  'delay_mode',
  'delay_minutes',
  'detergent_level',
  'detergent_auto',
  'detergent_amount',
  'softener_level',
  'softener_auto',
  'softener_amount',
  'disinfectant',
  'filter_clean',
  'tank_clean_slot',
  'tank_clean_minutes',
  'tank_clean_start',
  'tank_clean_stop',
  'drum_light',
  'noise_reduction',
  'detergent_reminder',
  'softener_reminder',
  'remote_control',
  'wash_count',
  'dry_count',
  'energy_use',
  'water_use',
  'unload_pending',
] as const;

export type LaundryRole = (typeof LAUNDRY_ROLES)[number];

export type LaundryValueRole =
  LaundryRole | 'fault' | Extract<StandardCapability, 'power' | 'child_lock'>;

export type LaundryValues = Readonly<Partial<Record<LaundryValueRole, JsonValue>>>;
