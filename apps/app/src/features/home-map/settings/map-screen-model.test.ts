import { describe, expect, it, vi } from 'vitest';
import {
  HOME_MAP,
  HOME_MAP_SCAN,
  HOME_MAP_VERSION_ID,
  type HomeMap,
  type HomeMapVersion,
} from '@smarteverything/domain';

vi.mock('../model/create-map', () => ({ EDITOR_PATH: '/home-map/edit' }));

const model = await import('./map-screen-model');
const { clock } = await import('../../../format/time');
const { entryToolState } = await import('../editor/tool-state');

const GROUND = '00000000-0000-4000-8000-0000000000f1';
const FIRST = '00000000-0000-4000-8000-0000000000f2';
const ROBOT = '00000000-0000-4000-8000-0000000000d1';
const AT = '2026-10-25T00:00:00.000Z';
const NOW = new Date(2026, 9, 25, 16, 0).getTime();

const floor = (id: string, name: string, level: number): object => ({
  id,
  name,
  level,
  elevation: 0,
  rooms: [],
  walls: [],
  openings: [],
  objects: [],
  placements: [],
  annotations: [],
});

const source = (id: string, lastImportedAt: string | null): object => ({
  id,
  kind: 'xiaomi_vacuum',
  deviceId: ROBOT,
  floorId: GROUND,
  transform: { rotationDeg: 0, tx: 0, ty: 0, mirrored: false },
  frame: { uid: null, name: null, boundsSignature: '0,0,1,1' },
  lastVersion: null,
  lastImportedAt,
  base: { rooms: [], walls: [], openings: [] },
  tombstones: [],
});

function mapOf(sources: readonly object[] = []): HomeMap {
  return HOME_MAP.parse({
    id: 'map-a',
    schemaVersion: 1,
    revision: 1,
    name: 'Home',
    north: 0,
    updatedAt: AT,
    sources,
    notices: [],
    floors: [floor(GROUND, 'Ground floor', 0), floor(FIRST, 'First floor', 1)],
  });
}

const MAP = mapOf();

function version(id: string, name: string | null, createdAt: string): HomeMapVersion {
  return {
    mapId: MAP.id,
    versionId: HOME_MAP_VERSION_ID.parse(id),
    name,
    createdAt,
    actor: 'profile:p',
  };
}

const local = (hour: number, minute: number, day = 25): string =>
  new Date(2026, 9, day, hour, minute).toISOString();

describe('map screen model', () => {
  it('names the scan file and whether it is lined up', () => {
    const scan = HOME_MAP_SCAN.parse({
      opacity: 1,
      residualM: 0.04,
      uploadedAt: AT,
      uploadedBy: 'profile:p',
      file: { hash: 'a'.repeat(64), format: 'spz', bytes: 10, name: 'home-scan.spz' },
      lod: null,
      transform: { tx: 0, ty: 0, tz: 0, yawDeg: 0, scale: 1, levelled: true },
      points: [],
    });
    expect(model.scanLine(scan)).toBe('home-scan.spz · lined up');
    expect(model.scanLine({ ...scan, residualM: null })).toBe('home-scan.spz · not lined up yet');
  });

  it('opens the editor on this map with a tool the editor reads, never the robot', () => {
    expect(model.editorHref(MAP.id, 'rooms')).toEqual({
      pathname: '/home-map/edit',
      params: { mapId: 'map-a', tool: 'rooms' },
    });
    expect(entryToolState({ mapId: 'map-a', tool: 'rooms' }).tool).toBe('rooms');
    expect(model.editorHref(MAP.id)).toEqual({
      pathname: '/home-map/edit',
      params: { mapId: 'map-a' },
    });
  });

  it('lists saved versions newest first with their date', () => {
    const older = version('v1', null, local(10, 0, 24));
    const newer = version('v2', 'Before the move', local(11, 5));
    expect(model.newestFirst([older, newer]).map((item) => item.versionId)).toEqual(['v2', 'v1']);
    expect(model.versionTitle(newer, NOW)).toBe(`Before the move · today ${clock(local(11, 5))}`);
    expect(model.versionTitle(older, NOW)).toBe(`Saved Yesterday ${clock(local(10, 0, 24))}`);
  });

  it('offers reset only for a map a robot feeds, delete always', () => {
    expect(model.dangerActions(MAP)).toEqual(['delete']);
    expect(model.dangerActions(mapOf([source('source-1', null)]))).toEqual(['reset', 'delete']);
  });

  it('turns outcomes into problems and reads the route id', () => {
    expect(model.outcomeProblem({ kind: 'done', value: null })).toBeNull();
    expect(model.outcomeProblem({ kind: 'refused', message: 'No' })).toBe('No');
    expect(model.outcomeProblem({ kind: 'offline' })).toBe('Connect to the hub to change this map');
    expect(model.mapIdOf('map-a')).toBe('map-a');
    expect(model.mapIdOf('')).toBeNull();
    expect(model.mapIdOf(['a', 'b'])).toBeNull();
  });
});

describe('realistic view upload line', () => {
  it('shows the running upload, a failed one and nothing when idle', () => {
    expect(model.scanUploadSubtitle({ kind: 'idle' })).toBeNull();
    expect(
      model.scanUploadSubtitle({
        kind: 'uploading',
        name: 'home.spz',
        sentBytes: 512 * 1024,
        totalBytes: 1024 * 1024,
      }),
    ).toBe('50% · 1 of 1 MB · you can keep using the app');
    expect(
      model.scanUploadSubtitle({
        kind: 'failed',
        name: 'home.spz',
        problem: 'no-space',
        detail: 'Not enough space on the hub',
      }),
    ).toBe('Not enough space on the hub');
  });
});
