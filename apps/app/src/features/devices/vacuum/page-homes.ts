import {
  appendTo,
  type DevicePresentation,
  type PresentationTier,
  type PresentedCapability,
} from '@smarteverything/domain';
import { CLEAN_MODE_REFS } from './model/clean-modes';
import { CONSUMABLE_PARTS } from './model/consumables';
import { presentedRows } from './model/presented-refs';
import { ROBOT_MAPS_REFS, SETTING_GROUPS } from './search-items';
import { SETTING_ROLES, START_ACTIONS, TANKS } from './sections/dock-model';

export type VacuumHome = 'hero' | 'clean' | 'care' | 'settings' | 'robot_maps' | 'not_offered';

export const CLEAN_PRESET_REFS: readonly string[] = ['vacuum_worry_free'];

export const CLEAN_MORE_REFS: readonly string[] = [
  'vacuum_spot_clean',
  'vacuum_clean_furniture',
  'vacuum_clean_object',
  'vacuum_skip_cleaning',
  'vacuum_final_cleaning',
  'vacuum_call_clean',
  'vacuum_start_custom',
];

export const CUSTOM_CLEANUP_REFS: readonly string[] = [
  'vacuum_start_user_sweep',
  'vacuum_add_user_sweep',
  'vacuum_modify_user_sweep',
  'vacuum_set_user_sweep',
  'vacuum_delete_user_sweep',
];

const HERO_REFS: readonly string[] = [
  'cleaning',
  'vacuum_start',
  'vacuum_pause',
  'vacuum_resume',
  'vacuum_dock',
  'vacuum_start_charge',
  'vacuum_stop_working',
  'vacuum_clean_rooms',
  'vacuum_clean_zones',
  'vacuum_identify',
  'vacuum_close_alert',
  'vacuum_stop_roller_wash',
  'vacuum_stop_dry',
];

export const HERO_DUPLICATE_REFS: readonly string[] = [
  'vacuum_stop',
  'vacuum_start_sweep_only',
  'vacuum_start_sweep_mop',
  'vacuum_sweep_before_mop',
  'vacuum_temp_clean_room',
  'vacuum_temp_clean_zone',
  'vacuum_set_room_settings',
  'vacuum_pause_mapping',
  'vacuum_resume_mapping',
  'vacuum_stop_mapping',
];

const NOT_OFFERED_REFS: readonly string[] = [
  'vacuum_set_video_password',
  'vacuum_forgot_video_password',
  'vacuum_add_schedule',
  'vacuum_modify_schedule',
  'vacuum_delete_schedule',
  'vacuum_switch_schedule',
  'vacuum_split_room',
  'vacuum_merge_rooms',
  'vacuum_rotate_map',
];

const DOCK_ACTION_REFS: readonly string[] = [
  ...START_ACTIONS.map((action) => action.role),
  ...TANKS.flatMap((tank) => (tank.emptyRole === null ? [] : [tank.emptyRole])),
];

const CARE_REFS: readonly string[] = CONSUMABLE_PARTS.map((part) => part.resetRole);

const SETTINGS_REFS: readonly string[] = SETTING_GROUPS.flatMap((group) => [
  ...group.rows,
  ...(group.readings?.rows ?? []),
  ...(group.guarded?.rows ?? []),
]);

export const VACUUM_HOMES: readonly {
  readonly home: VacuumHome;
  readonly refs: readonly string[];
}[] = [
  { home: 'hero', refs: [...HERO_REFS, ...HERO_DUPLICATE_REFS] },
  {
    home: 'clean',
    refs: [...CLEAN_MODE_REFS, ...CLEAN_PRESET_REFS, ...CLEAN_MORE_REFS, ...CUSTOM_CLEANUP_REFS],
  },
  { home: 'care', refs: [...SETTING_ROLES, ...DOCK_ACTION_REFS, ...CARE_REFS] },
  { home: 'settings', refs: SETTINGS_REFS },
  { home: 'robot_maps', refs: ROBOT_MAPS_REFS },
  { home: 'not_offered', refs: NOT_OFFERED_REFS },
];

const ON_PAGE_TIERS: ReadonlySet<PresentationTier> = new Set([
  'primary',
  'control',
  'setting',
  'extra',
]);

export function homeKeysOf(presentation: DevicePresentation): ReadonlyMap<string, VacuumHome[]> {
  const homes = new Map<string, VacuumHome[]>();
  for (const { home, refs } of VACUUM_HOMES) {
    for (const presented of presentedRows(presentation, refs)) {
      appendTo(homes, presented.key, home);
    }
  }
  return homes;
}

export function withoutHomeOf(presentation: DevicePresentation): readonly PresentedCapability[] {
  const homes = homeKeysOf(presentation);
  return presentation.capabilities.filter(
    (presented) => ON_PAGE_TIERS.has(presented.tier) && !homes.has(presented.key),
  );
}
