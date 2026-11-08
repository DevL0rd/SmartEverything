import { describe, expect, it } from 'vitest';
import { HOME_MAP_MAP_ID, buildSearchIndex, type SearchSources } from '@smarteverything/domain';
import { href } from '../../app-shell/hrefs';
import { matchIndex } from '../../search/match';
import type { SourceLinks } from '../../search/sources';
import { SCAN_HELP_PATH } from './components/stage/realistic-states';
import { EDITOR_PATH } from './model/create-map';
import { homeMapPages } from './search';
import { mapPageHref, type MapSearchItem } from './search-maps';

function mapOf(
  id: string,
  name: string,
  fedBy: readonly string[],
  hasScan: boolean,
): MapSearchItem {
  return { id: HOME_MAP_MAP_ID.parse(id), name, fedBy: [...fedBy], hasScan };
}

const GROUND = mapOf('map-ground', 'Ground', ['robot-1'], false);
const CABIN = mapOf('map-cabin', 'Cabin', [], true);

function linksOf(): SourceLinks {
  return { links: new Map(), icons: new Map(), parents: new Map(), plugins: new Set() };
}

function pagesOf(
  out: SourceLinks,
  maps: readonly MapSearchItem[] = [GROUND, CABIN],
): ReturnType<typeof homeMapPages> {
  return homeMapPages(
    { rooms: [], maps, categories: [], devices: [], presenceSensor: () => false },
    out,
  );
}

function titlesFor(query: string): readonly string[] {
  const sources: SearchSources = {
    devices: [],
    rooms: [],
    pages: pagesOf(linksOf()),
    settings: [],
    scenes: [],
    automations: [],
    irRemotes: [],
    cameras: [],
  };
  return [...matchIndex(buildSearchIndex(sources), query).hits.values()].map(
    (hit) => hit.entry.title,
  );
}

describe('home map settings search pages', () => {
  it('finds the plan-listed entries by their own words', () => {
    const wanted: readonly (readonly [string, string])[] = [
      ['home maps', 'Home maps'],
      ['add a map', 'Add a map'],
      ['create a map', 'Create a map'],
      ['robot maps', 'Robot maps'],
      ['which robot map feeds which floor', 'Which robot map feeds which floor'],
      ['realistic view', 'Realistic view'],
      ['upload a scan', 'Upload a scan'],
      ['align the scan', 'Align the scan'],
      ['how to scan your home', 'How to scan your home'],
      ['door and window sensors', 'Door and window sensors'],
      ['wall objects', 'Wall objects'],
      ['resize furniture', 'Resize furniture'],
      ['colour and style', 'Colour and style'],
      ['saved versions', 'Saved versions'],
      ["reset to the robot's map", "Reset to the robot's map"],
    ];
    for (const [query, title] of wanted) {
      expect(titlesFor(query), query).toContain(title);
    }
  });

  it('finds the editor entries by their synonyms', () => {
    expect(titlesFor('contact sensor')).toContain('Door and window sensors');
    expect(titlesFor('mount height')).toContain('Wall objects');
    expect(titlesFor('drag the handles')).toContain('Resize furniture');
    expect(titlesFor('color')).toContain('Colour and style');
    expect(titlesFor('splat')).toContain('Realistic view');
  });

  it('makes one entry per map and opens that map page', () => {
    const out = linksOf();
    pagesOf(out);
    expect(out.links.get('page:home-map:map:map-ground')).toStrictEqual(mapPageHref('map-ground'));
    expect(out.links.get('page:home-map:map:map-cabin')).toStrictEqual(
      href.settings.page('home/maps/map-cabin'),
    );
    expect(titlesFor('cabin')).toContain('Cabin');
    expect(out.parents.get('page:home-map:map:map-cabin')).toBe('page:home-map:maps');
    expect(out.parents.get('page:home-map:map:map-cabin:versions')).toBe(
      'page:home-map:map:map-cabin',
    );
  });

  it('offers the scan upload until a scan exists, then the alignment', () => {
    const out = linksOf();
    pagesOf(out);
    expect(out.links.has('page:home-map:map:map-ground:scan-upload')).toBe(true);
    expect(out.links.has('page:home-map:map:map-ground:scan-align')).toBe(false);
    expect(out.links.has('page:home-map:map:map-cabin:scan-align')).toBe(true);
    expect(out.links.has('page:home-map:map:map-cabin:scan-upload')).toBe(false);
    expect(out.links.get('page:home-map:map:map-ground:scan-upload')).toEqual({
      pathname: EDITOR_PATH,
      params: { mapId: 'map-ground', tool: 'scan' },
    });
    expect(out.links.get('page:home-map:map:map-cabin:scan-align')).toEqual({
      pathname: EDITOR_PATH,
      params: { mapId: 'map-cabin', tool: 'scan' },
    });
  });

  it('offers the reset only for maps a robot feeds', () => {
    const out = linksOf();
    pagesOf(out);
    expect(out.links.has('page:home-map:map:map-ground:reset')).toBe(true);
    expect(out.links.has('page:home-map:map:map-cabin:reset')).toBe(false);
  });

  it('opens Home maps for Add a map, the editor for Create a map and the help page for scanning', () => {
    const out = linksOf();
    pagesOf(out);
    expect(out.links.get('page:home-map:maps')).toStrictEqual(href.settings.page('home/maps'));
    expect(out.links.get('page:home-map:add-map')).toStrictEqual(href.settings.page('home/maps'));
    expect(out.links.get('page:home-map:create-map')).toStrictEqual({
      pathname: EDITOR_PATH,
      params: { tool: 'rooms' },
    });
    expect(out.links.get('page:home-map:robot-feeds')).toStrictEqual(
      href.settings.page('home/maps/robot-maps'),
    );
    expect(out.links.get('page:home-map:scan-help')).toBe(SCAN_HELP_PATH);
  });

  it('opens the editor tool each object entry belongs to', () => {
    const out = linksOf();
    pagesOf(out);
    const tools: Readonly<Record<string, string>> = {
      'door-window-sensors': 'openings',
      'wall-objects': 'furniture',
      'resize-furniture': 'furniture',
      'colour-and-style': 'furniture',
    };
    for (const [key, tool] of Object.entries(tools)) {
      expect(out.links.get(`page:home-map:${key}`)).toStrictEqual({
        pathname: EDITOR_PATH,
        params: { tool },
      });
      expect(out.parents.get(`page:home-map:${key}`)).toBe(`page:home-map:tool:${tool}`);
    }
  });

  it('keeps ids unique with many maps and lists no map entries before maps are known', () => {
    const many = Array.from({ length: 40 }, (_, index) =>
      mapOf(
        `map-${String(index)}`,
        `Map ${String(index)}`,
        index % 2 === 0 ? ['robot-1'] : [],
        index % 3 === 0,
      ),
    );
    const paths = pagesOf(linksOf(), many).map((page) => page.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.filter((path) => path.startsWith('home-map:map:'))).toHaveLength(
      many.length * 4 + many.filter((map) => map.fedBy.length > 0).length,
    );
    const without = homeMapPages(
      { rooms: [], maps: [], categories: [], devices: [], presenceSensor: () => false },
      linksOf(),
    );
    expect(without.some((page) => page.path.startsWith('home-map:map:'))).toBe(false);
  });
});
