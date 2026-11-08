import { describe, expect, it } from 'vitest';
import { HOME_MAP_MAP_ID, buildSearchIndex, type SearchSources } from '@smarteverything/domain';
import { href } from '../../app-shell/hrefs';
import { matchIndex } from '../../search/match';
import {
  sourcesOf,
  type NamedDevice,
  type SearchTables,
  type SourceLinks,
} from '../../search/sources';
import { emptyState, type Device } from '../../store/state';
import { EDITOR_PATH } from './model/create-map';
import { EDITOR_TOOLS } from './editor/tool-state';
import { SETTINGS } from './settings';
import { HOME_MAP_WORDS, homeMapDeviceItems, homeMapEditorHref, homeMapPages } from './search';

const STAMP = '2026-01-01T00:00:00.000Z';

function deviceOf(id: string, kind: Device['kind'], name: string): NamedDevice {
  const device: Device = {
    id,
    provider: 'local',
    external_id: id,
    parent_id: null,
    kind,
    name,
    display_name: null,
    model: 'test',
    manufacturer: 'Test',
    provider_room: null,
    room_id: 'r1',
    online: true,
    capabilities: [],
    details: {},
    hidden: false,
    favourite: false,
    position: 0,
    created_at: STAMP,
    updated_at: STAMP,
    label: name,
  };
  return { device, name, room: 'Living room' };
}

const LAMP = deviceOf('lamp', 'light', 'Floor lamp');
const CAMERA = deviceOf('cam', 'camera', 'Hall camera');
const RADAR = deviceOf('radar', 'sensor', 'Hall radar');

function linksOf(): SourceLinks {
  return { links: new Map(), icons: new Map(), parents: new Map(), plugins: new Set() };
}

function pagesOf(out: SourceLinks): ReturnType<typeof homeMapPages> {
  return homeMapPages(
    {
      rooms: [
        { id: 'r1', name: 'Living room' },
        { id: 'r2', name: 'Kitchen' },
      ],
      maps: [],
      categories: ['living_room', 'bedroom'],
      devices: [LAMP, CAMERA, RADAR],
      presenceSensor: (device) => device.id === 'radar',
    },
    out,
  );
}

function sourcesWith(pages: ReturnType<typeof homeMapPages>): SearchSources {
  return {
    devices: [],
    rooms: [],
    pages,
    settings: [],
    scenes: [],
    automations: [],
    irRemotes: [],
    cameras: [],
  };
}

function titlesFor(query: string): readonly string[] {
  const out = linksOf();
  const index = buildSearchIndex(sourcesWith(pagesOf(out)));
  return [...matchIndex(index, query).hits.values()].map((hit) => hit.entry.title);
}

describe('home map search pages', () => {
  it('registers every page once with a link, an icon and a parent', () => {
    const out = linksOf();
    const pages = pagesOf(out);
    const paths = pages.map((page) => page.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const path of paths) {
      expect(out.links.has(`page:${path}`)).toBe(true);
      expect(out.icons.has(`page:${path}`)).toBe(true);
      expect(out.parents.has(`page:${path}`)).toBe(true);
    }
  });

  it('covers the stage, edit map, make your map, import, draw rooms and the lights toggle', () => {
    const titles = pagesOf(linksOf()).map((page) => page.title);
    expect(titles).toEqual(
      expect.arrayContaining([
        'Home map',
        'Edit map',
        'Make your map',
        'Import from vacuum',
        'Draw rooms',
        'Lights on the map',
      ]),
    );
  });

  it('has one entry per editor tool, each opening the editor on that tool', () => {
    const out = linksOf();
    pagesOf(out);
    for (const tool of EDITOR_TOOLS) {
      expect(out.links.get(`page:home-map:tool:${tool}`)).toStrictEqual({
        pathname: EDITOR_PATH,
        params: { tool },
      });
      expect(out.parents.get(`page:home-map:tool:${tool}`)).toBe('page:home-map:edit');
    }
  });

  it('opens the editor path the editor route is mounted on', () => {
    expect(homeMapEditorHref()).toBe(EDITOR_PATH);
  });

  it('nests the stage under Home and the pinned map under Devices', () => {
    const out = linksOf();
    pagesOf(out);
    expect(out.parents.get('page:home-map')).toBe('page:home');
    expect(out.parents.get('page:home-map:devices')).toBe('page:devices');
    expect(out.links.get('page:home-map')).toBe(href.home());
    expect(out.links.get('page:home-map:devices')).toBe(href.devices());
  });

  it('sends the lights toggle to the Light up the map setting', () => {
    const out = linksOf();
    pagesOf(out);
    expect(out.links.get('page:home-map:lights')).toStrictEqual(
      href.settings.focus('home/map', 'home-map.light-up'),
    );
  });

  it('sends the robot map management words to Robot maps', () => {
    const out = linksOf();
    pagesOf(out);
    expect(out.links.get('page:home-map:robot-maps')).toStrictEqual(
      href.settings.page('home/maps/robot-maps'),
    );
    for (const query of ['delete map', 'erase map', 'clear map', 'restore map', 'build map']) {
      expect(titlesFor(query)).toContain('Robot maps');
    }
    expect(titlesFor('save map')).toContain('Robot maps');
    expect(titlesFor('backup')).toContain('Robot maps');
    expect(titlesFor('map name')).toContain('Robot maps');
  });

  it('shows a room on the Devices map by selecting it', () => {
    const out = linksOf();
    pagesOf(out);
    expect(out.links.get('page:home-map:room:r2')).toStrictEqual(
      href.devicesSelection({ room: 'r2' }),
    );
    expect(out.parents.get('page:home-map:room:r2')).toBe('page:home-map');
  });

  it('is found by every map synonym', () => {
    for (const word of [
      'floor plan',
      'layout',
      'house map',
      'blueprint',
      'furniture',
      'decorate',
    ]) {
      expect(titlesFor(word)).toEqual(
        expect.arrayContaining(['Home map', 'Edit map', 'Make your map', 'Draw rooms']),
      );
    }
  });

  it('finds a room and a device by name next to the map words', () => {
    expect(titlesFor('kitchen map')).toContain('Show Kitchen on the map');
    expect(titlesFor('lamp map')).toContain('Show on map');
  });
});

describe('home map device items', () => {
  const keys = (named: NamedDevice, presenceSensor: boolean): readonly string[] =>
    homeMapDeviceItems({ device: named.device, name: named.name, presenceSensor }).map(
      (item) => item.key,
    );

  it('gives every device Show on map and Place on map', () => {
    expect(keys(LAMP, false)).toStrictEqual(['show', 'place']);
  });

  it('adds the camera pose to cameras only', () => {
    expect(keys(CAMERA, false)).toStrictEqual(['show', 'place', 'camera-pose']);
  });

  it('adds the map view and zone drawing to presence sensors only', () => {
    expect(keys(RADAR, true)).toStrictEqual(['show', 'place', 'sensor-map', 'zone-map']);
  });

  it('selects the device on the Devices map and places it in the editor devices tool', () => {
    const [show, place] = homeMapDeviceItems({
      device: LAMP.device,
      name: LAMP.name,
      presenceSensor: false,
    });
    expect(show?.link).toStrictEqual(href.devicesSelection({ device: 'lamp' }));
    expect(place?.link).toStrictEqual({
      pathname: EDITOR_PATH,
      params: { tool: 'devices', select: 'lamp' },
    });
  });

  it('nests device items under the device and opens the sensor on its own page', () => {
    const out = linksOf();
    pagesOf(out);
    expect(out.parents.get('page:home-map:device:lamp:show')).toBe('device:lamp');
    expect(out.parents.get('page:home-map:device:lamp:place')).toBe('device:lamp');
    expect(out.links.get('page:home-map:device:radar:sensor-map')).toStrictEqual(
      href.device(RADAR.device),
    );
    expect(out.links.get('page:home-map:device:radar:zone-map')).toStrictEqual(
      href.settings.device('radar', 'presence-room', { focus: 'add-zone' }),
    );
    expect(out.links.has('page:home-map:device:lamp:camera-pose')).toBe(false);
    expect(out.links.get('page:home-map:device:cam:camera-pose')).toStrictEqual({
      pathname: EDITOR_PATH,
      params: { tool: 'devices', select: 'cam' },
    });
  });

  it('is found by camera pose words and by the sensor zone words', () => {
    expect(titlesFor('field of view')).toContain('Camera position and direction');
    expect(titlesFor('draw a zone')).toContain('Draw a zone on the home map');
  });
});

describe('home map catalogue categories', () => {
  it('are part of the home map pages, one per category', () => {
    const out = linksOf();
    const paths = pagesOf(out).filter((page) => page.path.startsWith('home-map:category:'));
    expect(paths.map((page) => page.path)).toStrictEqual([
      'home-map:category:living_room',
      'home-map:category:bedroom',
    ]);
  });
});

describe('home map settings rows', () => {
  it('carry every map synonym so each row is found as a map setting', () => {
    for (const row of SETTINGS) {
      expect(row.keywords).toEqual(expect.arrayContaining([...HOME_MAP_WORDS]));
    }
  });
});

describe('search sources', () => {
  it('include the home map pages next to the other pages', () => {
    const { tables } = emptyState();
    const search: SearchTables = {
      chats: [],
      homeMaps: [],
      modelCategories: [],
      devices: tables.devices,
      rooms: tables.rooms,
      deviceGroups: tables.device_groups,
      scenes: tables.scenes,
      automations: tables.automations,
      scheduled: tables.scheduled_actions,
      plugins: tables.plugins,
      automationPluginKinds: tables.automation_plugin_kinds,
      pluginStreams: tables.plugin_streams,
      pluginUi: tables.plugin_ui,
      extensions: undefined,
      configuration: undefined,
      inventory: undefined,
    };
    const env = {
      owner: true,
      platform: 'android',
      developer: false,
      availability: {
        hasDevices: true,
        hasClimate: false,
        hasCameras: false,
        hasHealth: false,
        hasScenes: false,
        hasEnergy: false,
        hasSecurity: false,
        hasIr: false,
        hasWatch: false,
        needsAttention: false,
      },
    } as const;
    const sources = sourcesOf(search, [LAMP], env, linksOf());
    const paths = sources.pages.map((page) => page.path);
    expect(paths).toEqual(
      expect.arrayContaining(['home-map', 'home-map:edit', 'home-map:device:lamp:place']),
    );
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('carry the per-map entries of the summary rows into the real search', () => {
    const { tables } = emptyState();
    const search: SearchTables = {
      chats: [],
      modelCategories: [],
      homeMaps: [
        {
          id: HOME_MAP_MAP_ID.parse('map-ground'),
          name: 'Ground',
          fedBy: ['robot-1'],
          hasScan: true,
        },
      ],
      devices: tables.devices,
      rooms: tables.rooms,
      deviceGroups: tables.device_groups,
      scenes: tables.scenes,
      automations: tables.automations,
      scheduled: tables.scheduled_actions,
      plugins: tables.plugins,
      automationPluginKinds: tables.automation_plugin_kinds,
      pluginStreams: tables.plugin_streams,
      pluginUi: tables.plugin_ui,
      extensions: undefined,
      configuration: undefined,
      inventory: undefined,
    };
    const env = {
      owner: true,
      platform: 'android',
      developer: false,
      availability: {
        hasDevices: true,
        hasClimate: false,
        hasCameras: false,
        hasHealth: false,
        hasScenes: false,
        hasEnergy: false,
        hasSecurity: false,
        hasIr: false,
        hasWatch: false,
        needsAttention: false,
      },
    } as const;
    const paths = sourcesOf(search, [], env, linksOf()).pages.map((page) => page.path);
    expect(paths.filter((path) => path.startsWith('home-map:map:map-ground'))).not.toHaveLength(0);
  });
});
