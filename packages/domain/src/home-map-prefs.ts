import { z } from 'zod';
import { clientPref, noLegacy } from './client-pref-definition';

export const HOME_MAP_ROOM_CLIMATE = ['chip', 'chip_tint', 'off'] as const;

export const HOME_MAP_WALL_STYLES = ['cutaway', 'low', 'full'] as const;

export const HOME_MAP_UNITS = ['metric'] as const;

export const HOME_MAP_STAGE_VIEWS = ['3d', 'realistic'] as const;

export type HomeMapStageView = (typeof HOME_MAP_STAGE_VIEWS)[number];

export const HOME_MAP_PINNED_SIZE = { min: 0.3, max: 0.7, initial: 0.5 } as const;

export const HOME_MAP_LOOK_PREF = z.strictObject({
  lightUp: z.boolean().describe('Lights that are on light up the rooms of the home map'),
  showFurniture: z.boolean().describe('Draw the furniture and objects placed on the home map'),
  showDeviceModels: z.boolean().describe('Draw a small model for each placed device'),
  roomClimate: z
    .enum(HOME_MAP_ROOM_CLIMATE)
    .describe(
      'chip: temperature and air quality chip in each room. chip_tint: the chip plus a room tint. off: nothing',
    ),
  showPeople: z.boolean().describe('Show the people the presence sensors see on the home map'),
  showAllCameraViews: z
    .boolean()
    .describe('Show the field of view of every camera, not only the selected one'),
  showOpeningState: z
    .boolean()
    .describe('Show whether doors and windows are open, closed or locked'),
  showRobot: z.boolean().describe('Show the robot vacuums on the home map'),
  wallStyle: z
    .enum(HOME_MAP_WALL_STYLES)
    .describe(
      'cutaway: walls facing the camera are cut low. low: all walls low. full: full height',
    ),
  showOnHome: z.boolean().describe('Show the home map at the top of the Home page'),
  units: z.enum(HOME_MAP_UNITS).describe('Units of the lengths shown on the home map'),
});

export type HomeMapLookPref = z.infer<typeof HOME_MAP_LOOK_PREF>;

export const HOME_MAP_VIEW_PREF = z.strictObject({
  view: z
    .record(z.string().min(1), z.enum(HOME_MAP_STAGE_VIEWS))
    .describe('Per page, whether this device shows the home map in 3d or as the realistic scan'),
  pinnedSize: z
    .number()
    .min(HOME_MAP_PINNED_SIZE.min)
    .max(HOME_MAP_PINNED_SIZE.max)
    .describe('Share of the Devices page height the pinned home map takes on this device'),
  pinnedCollapsed: z
    .boolean()
    .describe('Whether the pinned home map on the Devices page is folded away on this device'),
  lastFloor: z.string().min(1).nullable().describe('The floor this device showed last'),
});

export type HomeMapViewPref = z.infer<typeof HOME_MAP_VIEW_PREF>;

export const HOME_MAP_CLIENT_PREFS = {
  home_map_look: clientPref({
    storageKey: 'home-map-look',
    scope: 'profile',
    version: 1,
    defaultValue: {
      lightUp: true,
      showFurniture: true,
      showDeviceModels: true,
      roomClimate: 'chip',
      showPeople: true,
      showAllCameraViews: false,
      showOpeningState: true,
      showRobot: true,
      wallStyle: 'cutaway',
      showOnHome: true,
      units: 'metric',
    },
    schema: HOME_MAP_LOOK_PREF,
    legacy: noLegacy,
  }),
  home_map_view: clientPref({
    storageKey: 'home-map-view',
    scope: 'client',
    version: 2,
    defaultValue: {
      view: {},
      pinnedSize: HOME_MAP_PINNED_SIZE.initial,
      pinnedCollapsed: false,
      lastFloor: null,
    },
    schema: HOME_MAP_VIEW_PREF,
    legacy: noLegacy,
  }),
} as const;
