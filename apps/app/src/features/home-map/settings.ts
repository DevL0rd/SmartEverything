import { HOME_MAP_LOOK_PREF, type HomeMapLookPref } from '@smarteverything/domain';
import { href } from '../../app-shell/hrefs';
import { PREFS, prefValueOf, savePref } from '../../store/prefs';
import type { EntityStore } from '../../store/entity-store';
import type { StoreState } from '../../store/state';
import type {
  SelectSetting,
  SettingContext,
  SettingDefinition,
  SwitchSetting,
} from '../../settings/types';

export const HOME_MAP_SETTINGS_PAGE = 'home/map';

export const HOME_MAPS_PATH = 'home/maps';

const MAP_WORDS = [
  'home map',
  'map',
  'floor plan',
  'layout',
  'house map',
  'blueprint',
  'furniture',
  'decorate',
] as const;

type FlagKey = {
  readonly [K in keyof HomeMapLookPref]: HomeMapLookPref[K] extends boolean ? K : never;
}[keyof HomeMapLookPref];

const lookOf = (state: StoreState): HomeMapLookPref => prefValueOf(state, PREFS.homeMapLook);

function saveLook(store: EntityStore, patch: Partial<HomeMapLookPref>): Promise<void> {
  savePref(store, PREFS.homeMapLook, { ...lookOf(store.get()), ...patch });
  return Promise.resolve();
}

interface RowText {
  readonly id: string;
  readonly section: string;
  readonly title: string;
  readonly description: string;
  readonly keywords: readonly string[];
}

function flagRow(
  key: FlagKey,
  text: RowText,
  visible?: SwitchSetting['visible'],
): SettingDefinition {
  return {
    ...text,
    page: HOME_MAP_SETTINGS_PAGE,
    keywords: [...MAP_WORDS, ...text.keywords],
    scope: 'client',
    control: 'switch',
    ...(visible === undefined ? {} : { visible }),
    read: (state) => lookOf(state)[key],
    write: (value: boolean, context: SettingContext) => saveLook(context.store, { [key]: value }),
  };
}

function choiceRow(
  key: 'roomClimate' | 'wallStyle' | 'units',
  text: RowText,
  options: SelectSetting['options'],
): SettingDefinition {
  return {
    ...text,
    page: HOME_MAP_SETTINGS_PAGE,
    keywords: [...MAP_WORDS, ...text.keywords],
    scope: 'client',
    control: 'select',
    inline: true,
    options,
    read: (state) => lookOf(state)[key],
    write: (value: string, context: SettingContext) =>
      saveLook(context.store, {
        [key]: HOME_MAP_LOOK_PREF.shape[key].parse(value),
      }),
  };
}

export const SETTINGS: readonly SettingDefinition[] = [
  flagRow('lightUp', {
    id: 'home-map.light-up',
    section: 'Look',
    title: 'Light up the map',
    description: 'Lights that are on light up their rooms on the map',
    keywords: ['light', 'lights', 'lighting', 'glow', 'lamp', 'illuminate', 'brightness'],
  }),
  flagRow('showFurniture', {
    id: 'home-map.furniture',
    section: 'Look',
    title: 'Show furniture',
    description: 'Draw the furniture and objects you placed',
    keywords: ['furniture', 'objects', 'sofa', 'table', 'bed', 'decor', 'decorate'],
  }),
  flagRow('showDeviceModels', {
    id: 'home-map.device-models',
    section: 'Look',
    title: 'Show device models',
    description: 'Draw a small model for each device instead of a plain dot',
    keywords: ['device', 'devices', 'model', 'models', '3d', 'icons', 'dots'],
  }),
  choiceRow(
    'wallStyle',
    {
      id: 'home-map.wall-style',
      section: 'Look',
      title: 'Wall style',
      description: 'How tall the walls are drawn in 3D',
      keywords: ['wall', 'walls', 'cutaway', 'low walls', 'full walls', 'height', '3d'],
    },
    [
      { value: 'cutaway', label: 'Cutaway', description: 'Walls in front are cut low' },
      { value: 'low', label: 'Low', description: 'Every wall is low' },
      { value: 'full', label: 'Full', description: 'Every wall at full height' },
    ],
  ),
  choiceRow(
    'roomClimate',
    {
      id: 'home-map.room-climate',
      section: 'On the map',
      title: 'Room climate',
      description: 'Temperature and air quality in each room',
      keywords: ['climate', 'temperature', 'humidity', 'air quality', 'pm2.5', 'tint', 'chip'],
    },
    [
      { value: 'chip', label: 'Chip' },
      { value: 'chip_tint', label: 'Chip and tint' },
      { value: 'off', label: 'Off' },
    ],
  ),
  flagRow('showPeople', {
    id: 'home-map.people',
    section: 'On the map',
    title: 'People on the map',
    description: 'Show who the presence sensors see, live',
    keywords: ['people', 'presence', 'occupancy', 'person', 'tracks', 'shelly', 'radar'],
  }),
  flagRow('showOpeningState', {
    id: 'home-map.openings',
    section: 'On the map',
    title: 'Door and window state',
    description: 'Show which doors and windows are open, closed or locked',
    keywords: ['door', 'doors', 'window', 'windows', 'open', 'closed', 'lock', 'contact sensor'],
  }),
  flagRow('showRobot', {
    id: 'home-map.robot',
    section: 'On the map',
    title: 'Robot vacuum on the map',
    description: 'Show where the robot vacuums are, live',
    keywords: ['robot', 'vacuum', 'cleaner', 'robot vacuum', 'dock'],
  }),
  flagRow(
    'showAllCameraViews',
    {
      id: 'home-map.camera-views',
      section: 'On the map',
      title: 'Show all camera views',
      description: 'Show the field of view of every camera, not only the selected one',
      keywords: ['camera', 'cameras', 'cone', 'field of view', 'fov', 'view', 'frustum'],
    },
    (env) => env.availability.hasCameras,
  ),
  flagRow('showOnHome', {
    id: 'home-map.show-on-home',
    section: 'Where',
    title: 'Show the home map on Home',
    description: 'Put the map at the top of the Home page',
    keywords: ['home page', 'hero', 'top of home', 'hide map', 'show map'],
  }),
  choiceRow(
    'units',
    {
      id: 'home-map.units',
      section: 'Where',
      title: 'Units',
      description: 'Lengths and areas on the map',
      keywords: ['units', 'metric', 'metres', 'meters', 'feet', 'imperial', 'measure'],
    },
    [{ value: 'metric', label: 'Metric' }],
  ),
  {
    id: 'home-map.link.devices',
    page: 'devices',
    title: 'Home maps',
    description: 'Your maps, the robot maps that feed them and how every map looks',
    icon: 'plan',
    keywords: [...MAP_WORDS, 'home maps', 'maps', 'robot maps', 'default map', 'add a map'],
    scope: 'client',
    control: 'link',
    href: href.settings.page(HOME_MAPS_PATH),
  },
];
