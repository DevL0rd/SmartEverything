import type { AppHref } from '../../components/app-href';
import { isCamera, type SearchSources } from '@smarteverything/domain';
import { href } from '../../app-shell/hrefs';
import type { IconName } from '../../components/icon';
import type { Device } from '../../store/state';
import type { NamedDevice, SourceLinks } from '../../search/sources';
import { EDITOR_TOOLS, TOOL_INFO, type EditorTool } from './editor/tool-state';
import { objectPages } from './search-objects';
import { mapSettingsPages, type MapSearchItem } from './search-maps';
import {
  HOME_MAP_WORDS,
  STAGE,
  homeMapEditorHref,
  pagePath,
  register,
  type MapPage,
} from './search-shared';

export { HOME_MAP_WORDS, homeMapEditorHref };

const HOME_PAGE = 'page:home';
const DEVICES_PAGE = 'page:devices';
const LIGHTS_SETTING = 'home-map.light-up';
const SETTINGS_PAGE = 'home/map';

interface ToolSearch {
  readonly title: string;
  readonly keywords: readonly string[];
}

const TOOL_SEARCH: Readonly<Record<EditorTool, ToolSearch>> = {
  select: {
    title: 'Select on the map',
    keywords: ['select', 'pick', 'choose', 'tap', 'move', 'edit map'],
  },
  rooms: {
    title: 'Draw rooms',
    keywords: ['draw', 'room', 'rooms', 'outline', 'split', 'merge', 'build', 'make your map'],
  },
  walls: {
    title: 'Draw walls',
    keywords: ['wall', 'walls', 'draw', 'corner', 'partition'],
  },
  openings: {
    title: 'Add doors and windows',
    keywords: ['door', 'doors', 'window', 'windows', 'opening', 'openings', 'archway'],
  },
  furniture: {
    title: 'Place furniture',
    keywords: ['sofa', 'bed', 'table', 'chair', 'catalogue', 'catalog', 'objects', 'models'],
  },
  devices: {
    title: 'Arrange devices on the map',
    keywords: ['device', 'devices', 'place', 'move', 'tray', 'lamp', 'sensor', 'camera'],
  },
  materials: {
    title: 'Floor and wall materials',
    keywords: ['material', 'materials', 'floor', 'paint', 'finish', 'colour', 'color', 'style'],
  },
  measure: {
    title: 'Measure on the map',
    keywords: ['measure', 'distance', 'ruler', 'length', 'size', 'tape'],
  },
  notes: {
    title: 'Map notes',
    keywords: ['note', 'notes', 'pin', 'annotate', 'label', 'remember'],
  },
  align: {
    title: 'Import from vacuum',
    keywords: [
      'import',
      'vacuum',
      'robot',
      'robot map',
      'align',
      'line up',
      'scan',
      'align vacuum map',
    ],
  },
  scan: {
    title: 'Align the realistic view',
    keywords: ['realistic view', 'splat', 'gaussian splat', 'line up', 'rotate', 'scale'],
  },
};

function toolPages(): readonly MapPage[] {
  return EDITOR_TOOLS.map((tool) => ({
    path: `${STAGE}:tool:${tool}`,
    title: TOOL_SEARCH[tool].title,
    description: 'Home map editor',
    keywords: [...HOME_MAP_WORDS, 'edit map', 'editor', ...TOOL_SEARCH[tool].keywords],
    to: homeMapEditorHref({ tool }),
    parent: pagePath(`${STAGE}:edit`),
    icon: TOOL_INFO[tool].icon,
  }));
}

function stagePages(): readonly MapPage[] {
  const stage: MapPage = {
    path: STAGE,
    title: 'Home map',
    description: 'Home',
    keywords: [
      ...HOME_MAP_WORDS,
      'stage',
      '3d',
      'top view',
      'rooms',
      'devices on the map',
      'house',
      'pinned map',
    ],
    to: href.home(),
    parent: HOME_PAGE,
    icon: 'plan',
  };
  const pinned: MapPage = {
    ...stage,
    path: `${STAGE}:devices`,
    description: 'Devices',
    keywords: [...stage.keywords, 'filter by room', 'filter by device'],
    to: href.devices(),
    parent: DEVICES_PAGE,
  };
  return [stage, pinned];
}

function editorPages(): readonly MapPage[] {
  const edit: MapPage = {
    path: `${STAGE}:edit`,
    title: 'Edit map',
    description: 'Home map',
    keywords: [...HOME_MAP_WORDS, 'edit', 'editor', 'change', 'rearrange', 'redo', 'tools'],
    to: homeMapEditorHref(),
    parent: pagePath(STAGE),
    icon: 'pencil',
  };
  const make: MapPage = {
    ...edit,
    path: `${STAGE}:make`,
    title: 'Make your map',
    keywords: [...HOME_MAP_WORDS, 'make', 'create', 'new map', 'start', 'build', 'by hand', 'draw'],
    to: homeMapEditorHref({ tool: 'rooms' }),
  };
  return [edit, make, ...toolPages()];
}

function lightsPage(): MapPage {
  return {
    path: `${STAGE}:lights`,
    title: 'Lights on the map',
    description: 'Home map',
    keywords: [
      ...HOME_MAP_WORDS,
      'lights',
      'lighting',
      'lamp',
      'glow',
      'illuminate',
      'light up',
      'toggle',
      'on',
      'off',
    ],
    to: href.settings.focus(SETTINGS_PAGE, LIGHTS_SETTING),
    parent: pagePath(STAGE),
    icon: 'bulb',
  };
}

export interface MapRoom {
  readonly id: string;
  readonly name: string;
}

function roomPages(rooms: readonly MapRoom[]): readonly MapPage[] {
  return rooms.map((room) => ({
    path: `${STAGE}:room:${room.id}`,
    title: `Show ${room.name} on the map`,
    description: 'Home map',
    keywords: [...HOME_MAP_WORDS, 'show', 'find', 'locate', 'room', room.name],
    to: href.devicesSelection({ room: room.id }),
    parent: pagePath(STAGE),
    icon: 'plan',
  }));
}

function categoryTitle(category: string): string {
  const words = category.split(/[^\p{L}\p{N}]+/u).filter((word) => word !== '');
  const [first = '', ...rest] = words;
  return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(' ');
}

function categoryPages(categories: readonly string[]): readonly MapPage[] {
  return [...new Set(categories)].map((category) => ({
    path: `${STAGE}:category:${category}`,
    title: categoryTitle(category),
    description: 'Furniture catalogue',
    keywords: [...HOME_MAP_WORDS, 'catalogue', 'catalog', 'category', 'models', category],
    to: homeMapEditorHref({ tool: 'furniture', category }),
    parent: pagePath(`${STAGE}:tool:furniture`),
    icon: 'sofa',
  }));
}

type MapDevice = Pick<Device, 'id' | 'kind' | 'model'>;

export interface MapDeviceItem {
  readonly key: string;
  readonly title: string;
  readonly keywords: readonly string[];
  readonly link: AppHref;
  readonly icon: IconName;
}

const CAMERA_POSE_WORDS = [
  'camera',
  'pose',
  'position',
  'direction',
  'pan',
  'tilt',
  'height',
  'angle',
  'field of view',
  'fov',
  'cone',
  'frustum',
  'wedge',
  'view angle',
];

const SENSOR_MAP_WORDS = [
  'shelly',
  'presence',
  'radar',
  'sensor',
  'who is here',
  'people',
  'tracks',
  '3d',
  'top view',
];

const ZONE_MAP_WORDS = [
  'zone',
  'zones',
  'draw a zone',
  'paint',
  'area',
  'detection area',
  'edit zones',
  'shelly',
  'presence',
];

function sensorItems(device: MapDevice, words: readonly string[]): readonly MapDeviceItem[] {
  return [
    {
      key: 'sensor-map',
      title: 'Sensor on the home map',
      keywords: [...words, ...SENSOR_MAP_WORDS, 'map view', 'where it sees'],
      link: href.device(device),
      icon: 'plan',
    },
    {
      key: 'zone-map',
      title: 'Draw a zone on the home map',
      keywords: [...words, ...ZONE_MAP_WORDS],
      link: href.settings.device(device.id, 'presence-room', { focus: 'add-zone' }),
      icon: 'pencil',
    },
  ];
}

function cameraItems(device: MapDevice, words: readonly string[]): readonly MapDeviceItem[] {
  return [
    {
      key: 'camera-pose',
      title: 'Camera position and direction',
      keywords: [...words, ...CAMERA_POSE_WORDS],
      link: homeMapEditorHref({ tool: 'devices', select: device.id }),
      icon: 'cameras',
    },
  ];
}

export interface MapDeviceFacts {
  readonly device: MapDevice;
  readonly name: string;
  readonly presenceSensor: boolean;
}

export function homeMapDeviceItems(facts: MapDeviceFacts): readonly MapDeviceItem[] {
  const { device, name } = facts;
  const words = [...HOME_MAP_WORDS, name];
  return [
    {
      key: 'show',
      title: 'Show on map',
      keywords: [...words, 'show', 'find', 'locate', 'where'],
      link: href.devicesSelection({ device: device.id }),
      icon: 'plan',
    },
    {
      key: 'place',
      title: 'Place on map',
      keywords: [...words, 'place', 'put', 'move', 'position', 'arrange'],
      link: homeMapEditorHref({ tool: 'devices', select: device.id }),
      icon: 'plan',
    },
    ...(isCamera(device) ? cameraItems(device, words) : []),
    ...(facts.presenceSensor ? sensorItems(device, words) : []),
  ];
}

function devicePages(
  devices: readonly NamedDevice[],
  presenceSensor: (device: Device) => boolean,
): readonly MapPage[] {
  return devices.flatMap((named) =>
    homeMapDeviceItems({
      device: named.device,
      name: named.name,
      presenceSensor: presenceSensor(named.device),
    }).map((item) => ({
      path: `${STAGE}:device:${named.device.id}:${item.key}`,
      title: item.title,
      description: `${named.name} · Home map`,
      keywords: item.keywords,
      to: item.link,
      parent: `device:${named.device.id}`,
      icon: item.icon,
    })),
  );
}

export interface HomeMapSearchInput {
  readonly rooms: readonly MapRoom[];
  readonly maps: readonly MapSearchItem[];
  readonly categories: readonly string[];
  readonly devices: readonly NamedDevice[];
  readonly presenceSensor: (device: Device) => boolean;
}

export function homeMapPages(input: HomeMapSearchInput, out: SourceLinks): SearchSources['pages'] {
  return register(
    [
      ...stagePages(),
      ...editorPages(),
      lightsPage(),
      ...mapSettingsPages(input.maps),
      ...objectPages(),
      ...categoryPages(input.categories),
      ...roomPages(input.rooms),
      ...devicePages(input.devices, input.presenceSensor),
    ],
    out,
  );
}
