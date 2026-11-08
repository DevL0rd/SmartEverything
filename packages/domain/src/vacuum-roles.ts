import type { StandardCapability } from './capabilities';
import type { JsonValue } from './values';

export const VACUUM_CLEAN_ROOMS_KEY = 'raw:clean_rooms';

export const VACUUM_CLEAN_ZONES_KEY = 'raw:clean_zones';

export const VACUUM_MAP_KEY = 'raw:vacuum_map';

export const VACUUM_POSE_KEY = 'raw:vacuum_pose';

export const VACUUM_FAULT_KEY = 'raw:vacuum_fault';

export const VACUUM_ROOM_LINKS_KEY = 'raw:vacuum_room_links';

export const VACUUM_STATE_ROLES = [
  'vacuum_status',
  'vacuum_fault_ids',
  'vacuum_scope',
  'vacuum_mode',
  'vacuum_repeats',
  'vacuum_area',
  'vacuum_seconds',
  'vacuum_progress',
  'vacuum_job',
  'vacuum_asleep',
  'vacuum_locating',
  'vacuum_mop_attached',
  'vacuum_sweep_mop_status',
  'vacuum_last_clean_time',
  'vacuum_total_area',
  'vacuum_total_cleans',
  'vacuum_total_seconds',
  'vacuum_position',
  'vacuum_route',
  'vacuum_action_result',
  'vacuum_notice',
  'vacuum_voltage',
  'vacuum_control_locked_now',
  'vacuum_alarm',
  'vacuum_user_sweep_config',
  'vacuum_user_sweep_id',
  'vacuum_standard_rooms',
  'vacuum_standard_objects',
  'vacuum_standard_carpets',
] as const;

export const VACUUM_MAP_ROLES = [
  'vacuum_rooms',
  'vacuum_zones',
  'vacuum_no_go',
  'vacuum_walls',
  'vacuum_carpets',
  'vacuum_sills',
  'vacuum_furniture',
  'vacuum_ai_objects',
  'vacuum_hidden_zones',
  'vacuum_automation_furniture',
  'vacuum_schedules',
  'vacuum_map_object',
  'vacuum_trajectory_object',
  'vacuum_clean_record',
  'vacuum_cloud_records',
  'vacuum_map_slots',
  'vacuum_map_id',
  'vacuum_carpet_object',
  'vacuum_map_3d',
  'vacuum_map_switch',
  'vacuum_map_upload_stop',
  'vacuum_backups',
  'vacuum_restore_result',
] as const;

export const VACUUM_STATION_ROLES = [
  'vacuum_station_mode',
  'vacuum_station_progress',
  'vacuum_dry_left',
  'vacuum_tanks',
  'vacuum_sewage_tank',
  'vacuum_water_tank',
  'vacuum_station_water_tank',
  'vacuum_host_water_tank',
  'vacuum_water_check_list',
  'vacuum_water_check_status',
  'vacuum_water_change_installed',
  'vacuum_sewage_cleaning',
  'vacuum_self_cleaning_time',
  'vacuum_cut_hair_frequency',
] as const;

export const VACUUM_CONSUMABLE_ROLES = [
  'vacuum_mop_life',
  'vacuum_mop_left',
  'vacuum_main_brush_life',
  'vacuum_main_brush_left',
  'vacuum_side_brush_life',
  'vacuum_side_brush_left',
  'vacuum_filter_left',
  'vacuum_detergent_level',
  'vacuum_detergent_left',
  'vacuum_detergent_amount',
  'vacuum_dust_bag_life',
  'vacuum_dust_bag_left',
  'vacuum_roller_life',
  'vacuum_roller_left',
] as const;

export const VACUUM_SETTING_ROLES = [
  'vacuum_carpet_boost',
  'vacuum_carpet_avoidance',
  'vacuum_carpet_display',
  'vacuum_carpet_method',
  'vacuum_carpet_deep',
  'vacuum_carpet_discriminate',
  'vacuum_carpet_first',
  'vacuum_break_resume',
  'vacuum_mop_wash',
  'vacuum_mop_wash_frequency',
  'vacuum_mop_wash_by_time',
  'vacuum_mop_wash_water',
  'vacuum_mop_wash_frequency_no_tank',
  'vacuum_mop_water_no_tank',
  'vacuum_wash_temperature',
  'vacuum_hot_wash',
  'vacuum_repeat_wash',
  'vacuum_dry_time',
  'vacuum_auto_mop_dry',
  'vacuum_auto_dust',
  'vacuum_dust_frequency',
  'vacuum_auto_water_change',
  'vacuum_detergent_use',
  'vacuum_detergent_delivery',
  'vacuum_detergent_reminder',
  'vacuum_water_level_remind',
  'vacuum_mop_lift',
  'vacuum_mop_swing',
  'vacuum_mop_swing_frequency',
  'vacuum_mop_temperature',
  'vacuum_brush_swing',
  'vacuum_roller_swing',
  'vacuum_roller_auto_wash',
  'vacuum_edge_frequency',
  'vacuum_sweep_route',
  'vacuum_obstacle_strategy',
  'vacuum_low_region',
  'vacuum_worry_free',
  'vacuum_ai_detection',
  'vacuum_dirt_detection',
  'vacuum_object_detection',
  'vacuum_room_detection',
  'vacuum_scene_capture',
  'vacuum_night_light',
  'vacuum_ai_wake',
  'vacuum_plugin_reminder',
  'vacuum_dnd_period',
  'vacuum_dnd_now',
  'vacuum_voice_target',
  'vacuum_voice_current',
  'vacuum_voice_download_status',
  'vacuum_voice_download_progress',
  'vacuum_flash_light',
  'vacuum_video_warnings',
  'vacuum_video_shared',
  'vacuum_video_on',
  'vacuum_video_lock',
  'vacuum_lidar_status',
  'vacuum_lidar_button',
  'vacuum_self_check_items',
  'vacuum_self_check_results',
  'vacuum_spec_test',
  'vacuum_precise_diagnosis',
] as const;

export const VACUUM_CLEAN_ACTION_ROLES = [
  'vacuum_start',
  'vacuum_stop',
  'vacuum_dock',
  'vacuum_pause',
  'vacuum_resume',
  'vacuum_stop_working',
  'vacuum_start_charge',
  'vacuum_start_sweep_only',
  'vacuum_start_sweep_mop',
  'vacuum_sweep_before_mop',
  'vacuum_start_custom',
  'vacuum_clean_rooms',
  'vacuum_clean_zones',
  'vacuum_spot_clean',
  'vacuum_call_clean',
  'vacuum_start_user_sweep',
  'vacuum_clean_furniture',
  'vacuum_clean_object',
  'vacuum_temp_clean_room',
  'vacuum_temp_clean_zone',
  'vacuum_skip_cleaning',
  'vacuum_final_cleaning',
  'vacuum_start_patrol',
  'vacuum_close_alert',
  'vacuum_get_route',
  'vacuum_identify',
  'vacuum_system_info',
] as const;

export const VACUUM_STATION_ACTION_ROLES = [
  'vacuum_empty_dust',
  'vacuum_wash_mop',
  'vacuum_stop_wash',
  'vacuum_back_wash',
  'vacuum_dry_mop',
  'vacuum_stop_dry',
  'vacuum_eject',
  'vacuum_clean_station',
  'vacuum_empty_station_tank',
  'vacuum_empty_host_tank',
  'vacuum_start_roller_wash',
  'vacuum_stop_roller_wash',
  'vacuum_start_water_check',
  'vacuum_cancel_water_check',
  'vacuum_dust_set',
] as const;

export const VACUUM_MAP_ACTION_ROLES = [
  'vacuum_build_map',
  'vacuum_pause_mapping',
  'vacuum_resume_mapping',
  'vacuum_stop_mapping',
  'vacuum_set_zone',
  'vacuum_get_zone_configs',
  'vacuum_get_room_configs',
  'vacuum_set_room_settings',
  'vacuum_split_room',
  'vacuum_merge_rooms',
  'vacuum_rotate_map',
  'vacuum_clear_map',
  'vacuum_delete_map',
  'vacuum_set_map',
  'vacuum_save_map',
  'vacuum_auto_partition',
  'vacuum_set_map_name',
  'vacuum_refresh',
  'vacuum_restore_map',
  'vacuum_stop_map_upload',
  'vacuum_history_object',
  'vacuum_user_define',
  'vacuum_ai_picture',
  'vacuum_recognize_object',
] as const;

export const VACUUM_PROGRAM_ACTION_ROLES = [
  'vacuum_add_schedule',
  'vacuum_modify_schedule',
  'vacuum_delete_schedule',
  'vacuum_get_schedule',
  'vacuum_switch_schedule',
  'vacuum_add_user_sweep',
  'vacuum_modify_user_sweep',
  'vacuum_delete_user_sweep',
  'vacuum_set_user_sweep',
] as const;

export const VACUUM_SERVICE_ACTION_ROLES = [
  'vacuum_reset_mop',
  'vacuum_reset_main_brush',
  'vacuum_reset_side_brush',
  'vacuum_reset_filter',
  'vacuum_reset_detergent',
  'vacuum_reset_dust_bag',
  'vacuum_reset_roller',
  'vacuum_download_voice',
  'vacuum_voice_status',
  'vacuum_video_page',
  'vacuum_video_status',
  'vacuum_set_video_password',
  'vacuum_verify_video_password',
  'vacuum_forgot_video_password',
  'vacuum_control_lidar',
  'vacuum_remote_drive',
  'vacuum_enter_remote',
  'vacuum_exit_remote',
  'vacuum_try_listen',
  'vacuum_xiaoai_id',
  'vacuum_language',
  'vacuum_enter_check',
  'vacuum_check_ack',
  'vacuum_check_current',
  'vacuum_exit_check',
  'vacuum_start_check',
] as const;

export const VACUUM_ROLES = [
  ...VACUUM_STATE_ROLES,
  ...VACUUM_MAP_ROLES,
  ...VACUUM_STATION_ROLES,
  ...VACUUM_CONSUMABLE_ROLES,
  ...VACUUM_SETTING_ROLES,
  ...VACUUM_CLEAN_ACTION_ROLES,
  ...VACUUM_STATION_ACTION_ROLES,
  ...VACUUM_MAP_ACTION_ROLES,
  ...VACUUM_PROGRAM_ACTION_ROLES,
  ...VACUUM_SERVICE_ACTION_ROLES,
] as const;

export type VacuumRole = (typeof VACUUM_ROLES)[number];

export type VacuumValueRole =
  | VacuumRole
  | 'fault'
  | 'charging_state'
  | Extract<
      StandardCapability,
      | 'battery'
      | 'suction'
      | 'mop_level'
      | 'volume'
      | 'child_lock'
      | 'dnd'
      | 'filter_life'
      | 'cleaning'
    >;

export type VacuumValues = Readonly<Partial<Record<VacuumValueRole, JsonValue>>>;
