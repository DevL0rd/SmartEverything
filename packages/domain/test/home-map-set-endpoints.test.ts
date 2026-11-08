import { describe, expect, it } from 'vitest';
import { API_ENDPOINTS } from '../src/api/endpoints';
import { HOME_MAP_AREA_ENDPOINTS, HOME_MAP_SUMMARY_ROW } from '../src/api/endpoints-home-map';
import { HOME_MAP_SET_ENDPOINTS } from '../src/api/endpoints-home-map-set';
import { LIVE_TABLES, ROW_CHANGE } from '../src/api/live';
import { mcpOperationArea } from '../src/mcp/operations';

const SET_NAMES = [
  'listHomeMaps',
  'createHomeMap',
  'updateHomeMap',
  'deleteHomeMap',
  'listHomeMapVersions',
  'saveHomeMapVersion',
  'restoreHomeMapVersion',
  'resetHomeMapToSource',
  'listRobotMapFeeds',
  'setRobotMapFeed',
] as const;

const DEVICE = '3b9c1d52-7a40-4e1f-8c26-5d1e0f2a9b73';
const NOW = '2026-10-25T10:00:00.000Z';

const SUMMARY = {
  id: 'home',
  name: 'Home',
  revision: 4,
  floorNames: ['Ground'],
  roomCount: 6,
  isDefault: true,
  position: 0,
  fedBy: ['Robot vacuum'],
  hasScan: false,
  updatedAt: NOW,
};

describe('the home map set endpoints', () => {
  it('are registered once, member access like the rooms, one line each, in the home area', () => {
    expect(Object.keys(HOME_MAP_SET_ENDPOINTS).sort()).toStrictEqual([...SET_NAMES].sort());
    for (const name of SET_NAMES) {
      const entry = API_ENDPOINTS[name];
      expect(entry).toBe(HOME_MAP_SET_ENDPOINTS[name]);
      expect(entry.access).toBe(API_ENDPOINTS.createRoom.access);
      expect(entry.summary).not.toContain('\n');
      expect(mcpOperationArea(entry)).toBe('home');
    }
    const routes = SET_NAMES.map(
      (name) => `${API_ENDPOINTS[name].method} ${API_ENDPOINTS[name].path}`,
    );
    expect(routes).toStrictEqual([
      'GET /api/home-maps',
      'POST /api/home-maps',
      'PATCH /api/home-maps/:mapId',
      'DELETE /api/home-maps/:mapId',
      'GET /api/home-maps/:mapId/versions',
      'POST /api/home-maps/:mapId/versions',
      'POST /api/home-maps/:mapId/versions/:versionId/restore',
      'POST /api/home-maps/:mapId/reset',
      'GET /api/home-map/feeds',
      'PUT /api/home-map/feeds/:deviceId/:robotMapId',
    ]);
    const everyRoute = Object.values(API_ENDPOINTS).map((e) => `${e.method} ${e.path}`);
    for (const route of routes) expect(everyRoute.filter((r) => r === route)).toHaveLength(1);
  });

  it('create a map from a name and refuse an empty one', () => {
    const { body, response } = API_ENDPOINTS.createHomeMap;
    expect(body.safeParse({ name: 'Upstairs' }).success).toBe(true);
    expect(body.safeParse({ name: '  ' }).success).toBe(false);
    expect(body.safeParse({}).success).toBe(false);
    expect(response.parse(SUMMARY)).toMatchObject({ id: 'home', isDefault: true });
  });

  it('update a name, the default or the position and refuse an empty or unknown change', () => {
    const { body, params } = API_ENDPOINTS.updateHomeMap;
    expect(body.parse({ name: 'Cabin', isDefault: true, position: 2 })).toStrictEqual({
      name: 'Cabin',
      isDefault: true,
      position: 2,
    });
    expect(body.safeParse({}).success).toBe(false);
    expect(body.safeParse({ isDefault: false }).success).toBe(false);
    expect(body.safeParse({ position: -1 }).success).toBe(false);
    expect(body.safeParse({ floors: [] }).success).toBe(false);
    expect(params.safeParse({ mapId: '' }).success).toBe(false);
  });

  it('save and restore versions of one map', () => {
    expect(API_ENDPOINTS.saveHomeMapVersion.body.parse({})).toStrictEqual({});
    expect(API_ENDPOINTS.saveHomeMapVersion.body.parse({ name: 'Before the sofa' })).toStrictEqual({
      name: 'Before the sofa',
    });
    expect(
      API_ENDPOINTS.restoreHomeMapVersion.params.parse({ mapId: 'home', versionId: 'v1' }),
    ).toStrictEqual({
      mapId: 'home',
      versionId: 'v1',
    });
    const version = {
      mapId: 'home',
      versionId: 'v1',
      name: null,
      createdAt: NOW,
      actor: 'profile:1',
    };
    expect(API_ENDPOINTS.listHomeMapVersions.response.parse([version, version])).toHaveLength(2);
    expect(API_ENDPOINTS.restoreHomeMapVersion.response.parse({ revision: 7 })).toStrictEqual({
      revision: 7,
    });
  });

  it('reset every source or the one given', () => {
    const { body } = API_ENDPOINTS.resetHomeMapToSource;
    expect(body.parse({})).toStrictEqual({});
    expect(body.parse({ sourceId: 'source-1' })).toStrictEqual({ sourceId: 'source-1' });
    expect(body.safeParse({ sourceId: '' }).success).toBe(false);
  });

  it('assign a robot map to a floor of a map or to nothing, nothing else', () => {
    const { params, body, response } = API_ENDPOINTS.setRobotMapFeed;
    expect(params.parse({ deviceId: DEVICE, robotMapId: '2' })).toStrictEqual({
      deviceId: DEVICE,
      robotMapId: 2,
    });
    expect(params.safeParse({ deviceId: 'robot', robotMapId: '2' }).success).toBe(false);
    expect(params.safeParse({ deviceId: DEVICE, robotMapId: '-1' }).success).toBe(false);
    expect(body.safeParse({ mapId: 'home', floorId: 'floor-1' }).success).toBe(true);
    expect(body.safeParse({ target: null }).success).toBe(true);
    expect(body.safeParse({ mapId: 'home' }).success).toBe(false);
    expect(body.safeParse({ target: { mapId: 'home', floorId: 'floor-1' } }).success).toBe(false);
    const feed = { deviceId: DEVICE, robotMapId: 2, robotMapName: 'Upstairs', isCurrent: false };
    expect(response.parse({ ...feed, target: null })).toMatchObject({ target: null });
    expect(
      response.parse({ ...feed, target: { mapId: 'home', floorId: 'floor-1' } }),
    ).toMatchObject({ target: { mapId: 'home' } });
    expect(API_ENDPOINTS.listRobotMapFeeds.response.parse([])).toStrictEqual([]);
  });
});

describe('the optional mapId of the existing home map endpoints', () => {
  it('is accepted on every one and left out when not given', () => {
    for (const [name, entry] of Object.entries(HOME_MAP_AREA_ENDPOINTS)) {
      expect(entry.query.safeParse({ mapId: 'cabin' }).success, name).toBe(true);
      expect(entry.query.safeParse({ mapId: '' }).success, name).toBe(false);
      expect(entry.query.safeParse({ other: 1 }).success, name).toBe(false);
    }
    expect(API_ENDPOINTS.getHomeMap.query.parse({ mapId: 'cabin' })).toStrictEqual({
      mapId: 'cabin',
      view: 'full',
    });
    expect(API_ENDPOINTS.getHomeMap.query.parse({})).toStrictEqual({ view: 'full' });
    expect(API_ENDPOINTS.undoHomeMap.query.parse({})).toStrictEqual({});
    expect(
      API_ENDPOINTS.listHomeMapRevisions.query.parse({ mapId: 'cabin', after: '3' }),
    ).toStrictEqual({ mapId: 'cabin', after: 3 });
  });
});

describe('the home_maps summary row', () => {
  it('keeps old rows and takes the new optional fields', () => {
    const old = { id: 'home', revision: 1, name: 'Home', floors: 2, updatedAt: NOW };
    expect(HOME_MAP_SUMMARY_ROW.parse(old)).toStrictEqual(old);
    const grown = { ...old, position: 1, isDefault: false, fedBy: ['Robot'], hasScan: true };
    expect(HOME_MAP_SUMMARY_ROW.parse(grown)).toStrictEqual(grown);
    expect(HOME_MAP_SUMMARY_ROW.safeParse({ ...old, fedBy: [1] }).success).toBe(false);
    expect(LIVE_TABLES).toContain('home_maps');
    const change = ROW_CHANGE.parse({
      type: 'change',
      table: 'home_maps',
      operation: 'INSERT',
      record: grown,
      oldRecord: null,
    });
    expect(change.record).toStrictEqual(grown);
  });
});
