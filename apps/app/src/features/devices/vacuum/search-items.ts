import type { IconName } from '../../../components/icon';
import type { FamilySearchItem } from '../../../search/family-items';

export interface SettingGroupSpec {
  readonly id: string;
  readonly title: string;
  readonly icon: IconName;
  readonly note?: string;
  readonly keywords: readonly string[];
  readonly rows: readonly string[];
  readonly readings?: {
    readonly note: string;
    readonly rows: readonly string[];
  };
  readonly guarded?: {
    readonly title: string;
    readonly note: string;
    readonly rows: readonly string[];
  };
}

function words(...lists: readonly string[]): readonly string[] {
  return lists
    .flatMap((list) => list.split(','))
    .map((word) => word.trim())
    .filter((word) => word !== '');
}

const ROBOT = 'robot, vacuum, hoover, ';

export const CAMERA_PRIVACY_NOTE =
  'Live view only. Nothing from the robot’s camera is recorded or analysed. The video password is set in Xiaomi Home, never here.';

export const VIDEO_SWITCH_NOTE =
  'The app turns this on while you watch the camera and sets it back when you close it.';

export const MAP_UPLOAD_NOTE =
  'Stopping map upload means the map in this app stops updating until it is turned on again.';

export const MAP_GROUP_TITLE = 'Map';

export const MAP_FEED_TITLE = 'Which robot map feeds which map and floor';

export const LINK_ROOMS_TITLE = 'Link rooms';

export const LINK_ROOMS_NOTE = 'Pick the matching room for each robot room in the Rooms card';

export const MAP_MOVED_LINE = 'Saving, restoring and deleting maps is in Settings · Home maps.';

export const ROBOT_MAPS_REFS: readonly string[] = words(
  'vacuum_map_switch, vacuum_build_map, vacuum_save_map, vacuum_auto_partition',
  'vacuum_stop_map_upload, vacuum_restore_map, vacuum_clear_map, vacuum_delete_map',
  'vacuum_set_map, vacuum_set_map_name',
);

export const SETTING_GROUPS: readonly SettingGroupSpec[] = [
  {
    id: 'cleaning',
    title: 'Cleaning preferences',
    icon: 'settings',
    keywords: words(
      ROBOT,
      'resume after charging, mop lift, mop swing, roller swing, edge, corner, side brush',
    ),
    rows: words(
      'vacuum_break_resume, vacuum_mop_lift, vacuum_mop_swing, vacuum_mop_swing_frequency',
      'vacuum_roller_swing, vacuum_brush_swing',
    ),
  },
  {
    id: 'carpets',
    title: 'Carpets',
    icon: 'layers',
    keywords: words(
      ROBOT,
      'carpet, rug, carpet boost, avoid carpet, carpet recognition, deep clean carpet, show carpets',
    ),
    rows: words(
      'vacuum_carpet_boost, vacuum_carpet_avoidance, vacuum_carpet_method, vacuum_carpet_deep',
      'vacuum_carpet_discriminate, vacuum_carpet_first, vacuum_carpet_display',
    ),
  },
  {
    id: 'obstacles',
    title: 'Obstacles and AI',
    icon: 'brain',
    keywords: words(
      ROBOT,
      'ai, obstacle, avoidance, object recognition, dirt detection, real scene, photos',
      'low area, under furniture, bed, lidar',
    ),
    rows: words(
      'vacuum_ai_detection, vacuum_scene_capture, vacuum_dirt_detection, vacuum_object_detection',
      'vacuum_room_detection, vacuum_obstacle_strategy, vacuum_low_region',
    ),
  },
  {
    id: 'camera',
    title: 'Camera and privacy',
    icon: 'cameras',
    note: CAMERA_PRIVACY_NOTE,
    keywords: words(
      ROBOT,
      'camera, video, privacy, live view, fill light, flash, watched alert, shared members',
      'recording',
    ),
    rows: words('vacuum_flash_light, vacuum_video_warnings, vacuum_video_shared'),
    readings: { note: VIDEO_SWITCH_NOTE, rows: ['vacuum_video_on'] },
  },
  {
    id: 'voice',
    title: 'Voice and sound',
    icon: 'volume',
    keywords: words(ROBOT, 'volume, sound, loud, quiet, voice pack, language, beep'),
    rows: words(
      'volume, vacuum_voice_current, vacuum_voice_download_status, vacuum_voice_download_progress',
      'vacuum_voice_target, vacuum_download_voice',
    ),
  },
  {
    id: 'child-lock',
    title: 'Child lock',
    icon: 'lock',
    keywords: words(ROBOT, 'child lock, buttons, lock, physical, children'),
    rows: ['child_lock'],
  },
  {
    id: 'dnd',
    title: 'Do not disturb',
    icon: 'moon',
    keywords: words(ROBOT, 'quiet hours, night, silent, sleep, do not disturb, dnd'),
    rows: words('dnd, vacuum_dnd_period, vacuum_dnd_now'),
  },
  {
    id: 'system',
    title: 'Firmware and diagnostics',
    icon: 'info',
    keywords: words(
      ROBOT,
      'firmware, version, software, model, serial, lidar, diagnostics, self check, about',
    ),
    rows: ['vacuum_lidar_status'],
  },
];

interface Entry {
  readonly key: string;
  readonly title: string;
  readonly icon: IconName;
  readonly words: string;
}

const LINK_WORDS =
  'link rooms, room links, match rooms, home rooms, map rooms, unlinked, not linked, assign room, connect room, room names, which room';

const ENTRIES: readonly Entry[] = [
  {
    key: 'map-views',
    title: 'Map views: 3D and camera',
    icon: 'route',
    words:
      'map, 3d map, top view, floor plan, camera view, live view, where is the robot, robot location, follow robot, fit map, full screen map, find robot, locate robot, robot camera, video password',
  },
  {
    key: 'status',
    title: 'Robot status, battery and progress',
    icon: 'battery',
    words:
      'status, battery, charge, progress, area cleaned, time cleaning, what is it doing, error, stuck',
  },
  {
    key: 'controls',
    title: 'Start, pause, resume or dock the robot',
    icon: 'play',
    words: 'start, clean now, begin, pause, resume, stop, dock, charge',
  },
  {
    key: 'tab-clean',
    title: 'Clean tab',
    icon: 'vacuum',
    words:
      'tab, clean, how it cleans, mode, suction, water, passes, route, cleaning path, cleaning times, repeats, preset, worry free, custom cleanup, spot clean, furniture',
  },
  {
    key: 'rooms',
    title: 'Rooms',
    icon: 'home',
    words:
      'room, clean a room, select rooms, cleaning order, kitchen, bedroom, living room, floor material, hide room',
  },
  {
    key: 'link-rooms',
    title: 'Pick the home room of each map room',
    icon: 'link',
    words: `${LINK_WORDS}, home room selector, suggested room, create room, unlink, move link, rename room, room name, robot name, map changed, robot map`,
  },
  {
    key: 'link-rooms-notice',
    title: 'Rooms to link notice',
    icon: 'unlink',
    words: `${LINK_WORDS}, notice, badge, attention, warning, rooms need linking, map changed`,
  },
  {
    key: 'zones',
    title: 'Zones and no-go areas',
    icon: 'ban',
    words:
      'zone, clean zone, rectangle, draw zone, saved zones, no-go, restricted area, no mop, virtual wall, keep out',
  },
  {
    key: 'quick-mapping',
    title: 'Run a quick mapping',
    icon: 'locate',
    words: 'map, mapping, explore, build map, new map, no map yet',
  },
  {
    key: 'tab-schedule',
    title: 'Schedule tab',
    icon: 'calendar',
    words: 'tab, schedule, timer, appointment',
  },
  {
    key: 'schedules',
    title: 'Schedules',
    icon: 'alarmClock',
    words:
      'schedule, timer, appointment, every day, weekday, clean at, automatic clean, add schedule, automation, routine, cleaning schedule',
  },
  {
    key: 'dnd',
    title: 'Do not disturb hours',
    icon: 'moon',
    words: 'quiet hours, night, silent, sleep, do not disturb, dnd',
  },
  {
    key: 'tab-history',
    title: 'History tab',
    icon: 'history',
    words: 'tab, history, past cleans',
  },
  {
    key: 'history',
    title: 'Clean history and graphs',
    icon: 'trendUp',
    words:
      'history, past cleans, last clean, log, area per day, time per day, cleans per week, battery history, graph, chart, statistics',
  },
  {
    key: 'trail-replay',
    title: 'Replay where the robot went',
    icon: 'route',
    words: 'trail, route, path, replay, track, where did it clean',
  },
  {
    key: 'dock',
    title: 'Dock and station',
    icon: 'droplet',
    words:
      'dock, station, base, empty bin, dust bag, wash mop, dry mop, drying, water tank, dirty water, clean water, hot water, detergent',
  },
  {
    key: 'tab-care',
    title: 'Care tab',
    icon: 'wrench',
    words: 'tab, care, maintenance, consumables',
  },
  {
    key: 'care',
    title: 'Care and consumables',
    icon: 'wrench',
    words:
      'maintenance, main brush, side brush, filter, mop, roller, dust bag, detergent, wear, life left, replace, replaced it, reset life',
  },
  {
    key: 'settings',
    title: 'Robot settings',
    icon: 'settings',
    words: 'settings, preferences, options, configure, device settings',
  },
];

const SECTION_ITEMS: readonly FamilySearchItem[] = ENTRIES.map((entry) => ({
  key: entry.key,
  title: entry.title,
  page: 'overview',
  icon: entry.icon,
  keywords: words(ROBOT, entry.words),
}));

const GROUP_ITEMS: readonly FamilySearchItem[] = SETTING_GROUPS.map((group) => ({
  key: `settings-${group.id}`,
  title: `${group.title} settings`,
  page: 'overview',
  icon: group.icon,
  keywords: group.keywords,
}));

const MAP_ITEM: FamilySearchItem = {
  key: 'settings-map',
  title: `${MAP_GROUP_TITLE} settings`,
  page: 'overview',
  icon: 'route',
  keywords: words(
    ROBOT,
    'map, floor, robot map, which map, feed, feeds, updates automatically, home maps, map settings',
    LINK_WORDS,
  ),
};

export const VACUUM_SEARCH_ITEMS: readonly FamilySearchItem[] = [
  ...SECTION_ITEMS,
  ...GROUP_ITEMS,
  MAP_ITEM,
];
