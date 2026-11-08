import { describe, expect, it } from 'vitest';
import { HOME_MAP, HOME_MAP_ID, HOME_MAP_WRITE } from '../src/home-map';
import {
  HOME_MAP_FEED,
  HOME_MAP_FEED_ASSIGNMENT_WRITE,
  HOME_MAP_FEED_WRITE,
  HOME_MAP_MAP_ID,
  HOME_MAP_SUMMARY,
  HOME_MAP_SUMMARY_WRITE,
  HOME_MAP_VERSION,
  HOME_MAP_VERSION_WRITE,
} from '../src/home-map-set';
import { HOME_MAP_NOTICE, HOME_MAP_NOTICE_KINDS, HOME_MAP_SOURCE } from '../src/home-map-source';

const DEVICE = '3f2b8f9a-6d3c-4d6e-8d4e-0a1b2c3d4e5f';
const AT = '2026-10-25T10:00:00.000Z';

const document = (id: string): Readonly<Record<string, unknown>> => ({
  id,
  schemaVersion: 1,
  revision: 0,
  name: 'Studio',
  north: 0,
  updatedAt: AT,
  floors: [],
  sources: [],
  notices: [],
});

const source = {
  id: 'src-1',
  kind: 'xiaomi_vacuum',
  deviceId: DEVICE,
  floorId: 'floor-1',
  transform: { rotationDeg: 0, tx: 0, ty: 0, mirrored: false },
  frame: { uid: null, name: null, boundsSignature: 'b1' },
  lastVersion: null,
  lastImportedAt: null,
  base: { rooms: [], walls: [], openings: [] },
  tombstones: [],
};

const summary = {
  id: 'studio',
  name: 'Studio',
  revision: 4,
  floorNames: ['Ground', 'Loft'],
  roomCount: 5,
  isDefault: false,
  position: 1,
  fedBy: ['Robot vacuum'],
  hasScan: true,
  updatedAt: AT,
};

describe('map ids', () => {
  it('keeps home as the id of the first map and parses a second map id', () => {
    expect(HOME_MAP_ID).toBe('home');
    expect(HOME_MAP.parse(document('home')).id).toBe('home');
    expect(HOME_MAP.parse(document('cabin-2')).id).toBe('cabin-2');
    expect(HOME_MAP_WRITE.parse(document('studio')).id).toBe('studio');
  });

  it('rejects an empty map id', () => {
    expect(HOME_MAP_MAP_ID.safeParse('').success).toBe(false);
    expect(HOME_MAP.safeParse(document('')).success).toBe(false);
  });
});

describe('robot map sources and notices', () => {
  it('still parses a source without a robot map and keeps the robot map fields when set', () => {
    expect(HOME_MAP_SOURCE.parse(source).robotMapId).toBeUndefined();
    const parsed = HOME_MAP_SOURCE.parse({ ...source, robotMapId: 3, robotMapName: 'Upstairs' });
    expect(parsed.robotMapId).toBe(3);
    expect(parsed.robotMapName).toBe('Upstairs');
  });

  it('rejects a negative or fractional robot map id', () => {
    expect(HOME_MAP_SOURCE.safeParse({ ...source, robotMapId: -1 }).success).toBe(false);
    expect(HOME_MAP_SOURCE.safeParse({ ...source, robotMapId: 1.5 }).success).toBe(false);
  });

  it('accepts the new robot map notice and keeps unknown fields', () => {
    expect(HOME_MAP_NOTICE_KINDS).toContain('source_new_robot_map');
    const notice = {
      id: 'n-1',
      kind: 'source_new_robot_map',
      elementId: 'src-1',
      detail: 'Cabin',
      createdAt: AT,
      later: true,
    };
    expect(HOME_MAP_NOTICE.parse(notice)).toMatchObject({
      kind: 'source_new_robot_map',
      later: true,
    });
    expect(HOME_MAP_NOTICE.safeParse({ ...notice, kind: 'nope' }).success).toBe(false);
  });
});

describe('summaries', () => {
  it('round trips and keeps unknown fields on read', () => {
    expect(HOME_MAP_SUMMARY_WRITE.parse(summary)).toEqual(summary);
    expect(HOME_MAP_SUMMARY.parse({ ...summary, tag: 'x' })).toMatchObject({ tag: 'x' });
    expect(HOME_MAP_SUMMARY_WRITE.safeParse({ ...summary, tag: 'x' }).success).toBe(false);
  });

  it('rejects a summary with a missing or negative count', () => {
    expect(HOME_MAP_SUMMARY.safeParse({ ...summary, roomCount: -1 }).success).toBe(false);
    expect(HOME_MAP_SUMMARY.safeParse({ ...summary, isDefault: undefined }).success).toBe(false);
  });
});

describe('versions', () => {
  const version = { mapId: 'studio', versionId: 'v-1', name: null, createdAt: AT, actor: 'user' };

  it('round trips with and without a name and keeps unknown fields on read', () => {
    expect(HOME_MAP_VERSION_WRITE.parse(version)).toEqual(version);
    expect(HOME_MAP_VERSION_WRITE.parse({ ...version, name: 'Before move' }).name).toBe(
      'Before move',
    );
    expect(HOME_MAP_VERSION.parse({ ...version, size: 9 })).toMatchObject({ size: 9 });
  });

  it('rejects an empty actor', () => {
    expect(HOME_MAP_VERSION.safeParse({ ...version, actor: '' }).success).toBe(false);
  });
});

describe('robot map feeds', () => {
  const feed = {
    deviceId: DEVICE,
    robotMapId: 2,
    robotMapName: 'Cabin',
    isCurrent: true,
    target: { mapId: 'studio', floorId: 'floor-1' },
  };

  it('round trips assigned and not used feeds and keeps unknown fields on read', () => {
    expect(HOME_MAP_FEED_WRITE.parse(feed)).toEqual(feed);
    expect(HOME_MAP_FEED_WRITE.parse({ ...feed, target: null }).target).toBeNull();
    const read = HOME_MAP_FEED.parse({ ...feed, target: { ...feed.target, extra: 1 }, hint: 'a' });
    expect(read).toMatchObject({ hint: 'a', target: { extra: 1 } });
  });

  it('takes an assignment either to a map and floor or to not used, and nothing else', () => {
    expect(HOME_MAP_FEED_ASSIGNMENT_WRITE.parse({ mapId: 'studio', floorId: 'f' })).toEqual({
      mapId: 'studio',
      floorId: 'f',
    });
    expect(HOME_MAP_FEED_ASSIGNMENT_WRITE.parse({ target: null })).toEqual({ target: null });
    expect(HOME_MAP_FEED_ASSIGNMENT_WRITE.safeParse({ mapId: 'studio' }).success).toBe(false);
    expect(HOME_MAP_FEED_ASSIGNMENT_WRITE.safeParse({ target: 'x' }).success).toBe(false);
  });
});
