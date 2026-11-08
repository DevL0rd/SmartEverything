import type { AppHref } from '../../components/app-href';
import type { HomeMapSummary } from '@smarteverything/domain';
import { href } from '../../app-shell/hrefs';
import { HOME_MAPS_PATH } from './settings';
import {
  HOME_MAP_WORDS,
  SCAN_HELP_ROUTE,
  STAGE,
  homeMapEditorHref,
  pagePath,
  type MapPage,
} from './search-shared';

export type MapSearchItem = Pick<HomeMapSummary, 'id' | 'name' | 'fedBy' | 'hasScan'>;

const DEVICES_SETTINGS_PAGE = 'setting:page/devices';
const MAPS_LIST = `${STAGE}:maps`;
const MAPS_WORDS = [...HOME_MAP_WORDS, 'home maps', 'maps', 'multiple maps', 'floors'];
const SCAN_WORDS = [
  'realistic view',
  'realistic',
  'scan',
  'home scan',
  'gaussian splat',
  'splat',
  'spz',
  'ply',
  'photo',
  '3d scan',
];

export function mapPageHref(mapId: string): AppHref {
  return href.settings.page(`${HOME_MAPS_PATH}/${mapId}`);
}

function mapsListPage(): MapPage {
  return {
    path: MAPS_LIST,
    title: 'Home maps',
    description: 'Settings',
    keywords: [
      ...MAPS_WORDS,
      'default map',
      'shown first',
      'map look',
      'every map',
      'second map',
      'another map',
      'cabin',
      'upstairs',
    ],
    to: href.settings.page(HOME_MAPS_PATH),
    parent: DEVICES_SETTINGS_PAGE,
    icon: 'plan',
  };
}

function addAndCreatePages(): readonly MapPage[] {
  const parent = pagePath(MAPS_LIST);
  return [
    {
      path: `${STAGE}:add-map`,
      title: 'Add a map',
      description: 'Settings · Home maps',
      keywords: [...MAPS_WORDS, 'add', 'new map', 'another map', 'second map', 'second home'],
      to: href.settings.page(HOME_MAPS_PATH),
      parent,
      icon: 'plus',
    },
    {
      path: `${STAGE}:create-map`,
      title: 'Create a map',
      description: 'Home map',
      keywords: [
        ...MAPS_WORDS,
        'create',
        'make',
        'new map',
        'no map yet',
        'draw the rooms',
        'by hand',
        'draw',
      ],
      to: homeMapEditorHref({ tool: 'rooms' }),
      parent,
      icon: 'pencil',
    },
  ];
}

const ROBOT_MAP_WORDS = [
  'switch map',
  'use this map',
  'build map',
  'save map',
  'auto partition',
  'room partition',
  'cloud upload',
  'map upload',
  'delete map',
  'erase map',
  'clear map',
  'restore map',
  'backup',
  'map name',
];

const ROBOT_FEED_WORDS = [
  'feeds',
  'feed',
  'floor',
  'source',
  'updates automatically',
  'not used',
  'map switch method',
  'which floor',
  'assign',
  'link rooms',
];

function robotPages(): readonly MapPage[] {
  const robotWords = [...MAPS_WORDS, 'robot', 'vacuum', 'robot map', 'robot maps'];
  const to = href.settings.page(`${HOME_MAPS_PATH}/robot-maps`);
  return [
    {
      path: `${STAGE}:robot-maps`,
      title: 'Robot maps',
      description: 'Settings · Home maps',
      keywords: [...robotWords, ...ROBOT_MAP_WORDS],
      to,
      parent: DEVICES_SETTINGS_PAGE,
      icon: 'route',
    },
    {
      path: `${STAGE}:robot-feeds`,
      title: 'Which robot map feeds which floor',
      description: 'Settings · Robot maps',
      keywords: [...robotWords, ...ROBOT_FEED_WORDS],
      to,
      parent: pagePath(MAPS_LIST),
      icon: 'route',
    },
  ];
}

function scanHelpPage(): MapPage {
  return {
    path: `${STAGE}:scan-help`,
    title: 'How to scan your home',
    description: 'Realistic view',
    keywords: [
      ...MAPS_WORDS,
      ...SCAN_WORDS,
      'how to scan',
      'capture',
      'scanner app',
      'guide',
      'help',
      'upload a scan',
    ],
    to: SCAN_HELP_ROUTE,
    parent: pagePath(MAPS_LIST),
    icon: 'info',
  };
}

function mapPage(map: MapSearchItem, parent: string): MapPage {
  return {
    path: `${STAGE}:map:${map.id}`,
    title: map.name,
    description: 'Home maps',
    keywords: [
      ...MAPS_WORDS,
      map.name,
      'rename map',
      'map name',
      'default map',
      'add floor',
      'delete this map',
      'split a room',
      'merge two rooms',
    ],
    to: mapPageHref(map.id),
    parent,
    icon: 'plan',
  };
}

function scanEditorHref(mapId: string): AppHref {
  return homeMapEditorHref({ mapId, tool: 'scan' });
}

function scanPages(map: MapSearchItem, parent: string): readonly MapPage[] {
  const base = {
    description: `${map.name} · Home maps`,
    to: mapPageHref(map.id),
    parent,
  };
  const keywords = (...extra: readonly string[]): readonly string[] => [
    ...MAPS_WORDS,
    map.name,
    ...SCAN_WORDS,
    ...extra,
  ];
  return [
    {
      ...base,
      path: `${STAGE}:map:${map.id}:realistic`,
      title: 'Realistic view',
      keywords: keywords('add a realistic view', 'remove the realistic view', 'replace the file'),
      icon: 'image',
    },
    map.hasScan
      ? {
          ...base,
          path: `${STAGE}:map:${map.id}:scan-align`,
          title: 'Align the scan',
          to: scanEditorHref(map.id),
          keywords: keywords('align', 'line up', 'align realistic view', 'rotation', 'scale'),
          icon: 'maximize',
        }
      : {
          ...base,
          path: `${STAGE}:map:${map.id}:scan-upload`,
          title: 'Upload a scan',
          to: scanEditorHref(map.id),
          keywords: keywords('upload', 'choose a file', 'add a realistic view'),
          icon: 'upload',
        },
  ];
}

function versionPages(map: MapSearchItem, parent: string): readonly MapPage[] {
  const base = {
    description: `${map.name} · Home maps`,
    to: mapPageHref(map.id),
    parent,
  };
  const saved: MapPage = {
    ...base,
    path: `${STAGE}:map:${map.id}:versions`,
    title: 'Saved versions',
    keywords: [
      ...MAPS_WORDS,
      map.name,
      'save this version',
      'restore',
      'backup',
      'history',
      'undo changes',
      'snapshot',
    ],
    icon: 'clock',
  };
  const reset: MapPage = {
    ...base,
    path: `${STAGE}:map:${map.id}:reset`,
    title: "Reset to the robot's map",
    keywords: [
      ...MAPS_WORDS,
      map.name,
      'reset',
      'robot',
      'vacuum',
      'start over',
      'drop my changes',
      'restore the robot map',
    ],
    icon: 'undo',
  };
  return map.fedBy.length === 0 ? [saved] : [saved, reset];
}

function eachMapPages(maps: readonly MapSearchItem[]): readonly MapPage[] {
  const parent = pagePath(MAPS_LIST);
  return maps.flatMap((map) => {
    const own = pagePath(`${STAGE}:map:${map.id}`);
    return [mapPage(map, parent), ...scanPages(map, own), ...versionPages(map, own)];
  });
}

export function mapSettingsPages(maps: readonly MapSearchItem[]): readonly MapPage[] {
  return [
    mapsListPage(),
    ...addAndCreatePages(),
    ...robotPages(),
    scanHelpPage(),
    ...eachMapPages(maps),
  ];
}
