import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { API_ENDPOINTS } from '../src/api/endpoints';
import { HOME_MAP_AREA_ENDPOINTS, HOME_MAP_SUMMARY_ROW } from '../src/api/endpoints-home-map';
import { ROW_CHANGE, LIVE_TABLES, TABLE_ROWS, splitLiveTables } from '../src/api/live';
import { HOME_MAP_EDIT_BATCH } from '../src/home-map-edit-ops';
import { mcpOperationArea, mcpToolOperation } from '../src/mcp/operations';
import { MCP_OPERATION_TOOLS } from '../src/mcp/names';

const NAMES = [
  'getHomeMap',
  'editHomeMap',
  'undoHomeMap',
  'redoHomeMap',
  'listHomeMapRevisions',
  'importHomeMapSource',
  'alignHomeMapSource',
  'resolveHomeMapNotice',
  'placeHomeMapDevices',
] as const;

const PACKAGE = z.object({ exports: z.record(z.string(), z.string()) });

const FLOOR = 'floor-1';
const SUMMARY = {
  id: 'home',
  revision: 4,
  name: 'Home',
  floors: 2,
  updatedAt: '2026-10-25T10:00:00.000Z',
};

describe('the home map endpoints', () => {
  it('are registered once each with the room endpoints access and a one line description', () => {
    expect(Object.keys(HOME_MAP_AREA_ENDPOINTS).sort()).toStrictEqual([...NAMES].sort());
    for (const name of NAMES) {
      expect(API_ENDPOINTS[name]).toBe(HOME_MAP_AREA_ENDPOINTS[name]);
      expect(API_ENDPOINTS[name].access).toBe(API_ENDPOINTS.createRoom.access);
      expect(API_ENDPOINTS[name].path.startsWith('/api/home-map')).toBe(true);
      expect(API_ENDPOINTS[name].summary).not.toContain('\n');
    }
    const routes = NAMES.map((name) => `${API_ENDPOINTS[name].method} ${API_ENDPOINTS[name].path}`);
    expect(new Set(routes).size).toBe(NAMES.length);
    const summaries = NAMES.map((name) => API_ENDPOINTS[name].summary);
    expect(new Set(summaries).size).toBe(NAMES.length);
  });

  it('are reachable by the AI in the home area, each under one name', () => {
    const operations = MCP_OPERATION_TOOLS.map(([, operation]) => operation);
    for (const name of NAMES) {
      expect(mcpOperationArea(API_ENDPOINTS[name])).toBe('home');
      expect(operations.filter((operation) => operation === name)).toHaveLength(1);
    }
    expect(mcpToolOperation('read_home_map')).toBe('getHomeMap');
    expect(mcpToolOperation('place_home_map_devices')).toBe('placeHomeMapDevices');
  });

  it('read the full map by default and the compact map on request', () => {
    const { query, response } = API_ENDPOINTS.getHomeMap;
    expect(query.parse({})).toStrictEqual({ view: 'full' });
    expect(query.parse({ view: 'compact' })).toStrictEqual({ view: 'compact' });
    expect(query.safeParse({ view: 'rings' }).success).toBe(false);
    const compact = {
      view: 'compact',
      revision: 2,
      name: 'Home',
      floors: [
        {
          id: FLOOR,
          name: 'Ground',
          level: 0,
          rooms: [
            {
              id: 'room-1',
              name: 'Living room',
              homeRoomId: null,
              areaSquareMetres: 18.5,
              bounds: { minX: 0, minY: 0, maxX: 5, maxY: 4 },
            },
          ],
          objects: [
            { id: 'sofa-1', name: 'Three-seat sofa', modelId: 'cat.sofa', roomId: 'room-1' },
          ],
          devices: [
            {
              deviceId: '3b9c1d52-7a40-4e1f-8c26-5d1e0f2a9b73',
              roomId: 'room-1',
              position: 'north wall',
            },
          ],
        },
      ],
    };
    expect(response.parse(compact)).toMatchObject({ view: 'compact' });
  });

  it('take edits as a batch on a revision and refuse an empty batch', () => {
    const { body } = API_ENDPOINTS.editHomeMap;
    expect(body).toBe(HOME_MAP_EDIT_BATCH);
    expect(body.safeParse({ baseRevision: 3, ops: [] }).success).toBe(false);
    expect(
      body.safeParse({ baseRevision: 3, ops: [{ op: 'removeFloor', floorId: FLOOR }] }).success,
    ).toBe(true);
    expect(
      API_ENDPOINTS.editHomeMap.response.safeParse({
        revision: 4,
        conflicts: [
          { index: 0, op: 'update', kind: 'object', id: 'sofa-1', reason: 'missing_element' },
        ],
      }).success,
    ).toBe(true);
  });

  it('align a source by a transform or by two point pairs and nothing else', () => {
    const { body } = API_ENDPOINTS.alignHomeMapSource;
    const pair = { source: { x: 0, y: 0 }, house: { x: 1, y: 2 } };
    expect(
      body.safeParse({ transform: { rotationDeg: 90, tx: 1, ty: 2, mirrored: false } }).success,
    ).toBe(true);
    expect(body.safeParse({ points: [pair, pair] }).success).toBe(true);
    expect(body.safeParse({ points: [pair] }).success).toBe(false);
    expect(body.safeParse({}).success).toBe(false);
  });

  it('settle a notice with one of the four actions', () => {
    const { body } = API_ENDPOINTS.resolveHomeMapNotice;
    for (const action of ['use_source', 'keep_mine', 'split_like_source', 'delete']) {
      expect(body.safeParse({ action }).success).toBe(true);
    }
    expect(body.safeParse({ action: 'ignore' }).success).toBe(false);
  });

  it('import a source from a device and place devices for a room or a list', () => {
    const device = '3b9c1d52-7a40-4e1f-8c26-5d1e0f2a9b73';
    const imported = API_ENDPOINTS.importHomeMapSource.body;
    expect(imported.safeParse({ kind: 'xiaomi_vacuum', deviceId: device }).success).toBe(true);
    expect(imported.safeParse({ kind: 'unknown_maker', deviceId: device }).success).toBe(false);
    const placed = API_ENDPOINTS.placeHomeMapDevices.body;
    expect(placed.safeParse({}).success).toBe(true);
    expect(placed.safeParse({ roomId: device }).success).toBe(true);
    expect(placed.safeParse({ deviceIds: [device] }).success).toBe(true);
    expect(placed.safeParse({ deviceIds: ['sofa'] }).success).toBe(false);
  });

  it('filter the revision log by actor and starting revision without a count cap', () => {
    const { query } = API_ENDPOINTS.listHomeMapRevisions;
    expect(query.parse({})).toStrictEqual({});
    expect(query.parse({ actor: 'ai:profile-1', after: '12' })).toStrictEqual({
      actor: 'ai:profile-1',
      after: 12,
    });
    expect(query.safeParse({ actor: 'robot' }).success).toBe(false);
    expect(query.safeParse({ limit: '5' }).success).toBe(false);
  });
});

describe('the home_maps live table', () => {
  it('is a known table whose rows are summaries, never the document', () => {
    expect(LIVE_TABLES).toContain('home_maps');
    expect(TABLE_ROWS.home_maps).toBe(HOME_MAP_SUMMARY_ROW);
    expect(splitLiveTables(['home_maps', 'rooms'])).toStrictEqual({
      known: ['home_maps', 'rooms'],
      unknown: [],
    });
    const change = ROW_CHANGE.parse({
      type: 'change',
      table: 'home_maps',
      operation: 'UPDATE',
      record: SUMMARY,
      oldRecord: { ...SUMMARY, revision: 3 },
    });
    expect(change.record).toStrictEqual(SUMMARY);
  });

  it('rejects a summary that carries a floor list instead of the floor count', () => {
    expect(HOME_MAP_SUMMARY_ROW.safeParse({ ...SUMMARY, floors: [{ id: FLOOR }] }).success).toBe(
      false,
    );
  });
});

describe('the package exports', () => {
  it('offer the map schema to the web view through the home-map subpath', () => {
    const manifest = PACKAGE.parse(
      JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')),
    );
    expect(manifest.exports['./home-map']).toBe('./src/home-map.ts');
  });
});
