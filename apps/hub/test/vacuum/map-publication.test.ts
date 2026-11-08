import {
  VACUUM_MAP_KEY,
  VACUUM_POSE_KEY,
  VACUUM_SAVED_MAPS,
  VACUUM_SAVED_MAPS_KEY,
  VACUUM_SCENE,
  type DeviceEvent,
  type StateUpdate,
  type VacuumScene,
} from '@smarteverything/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { EMPTY_ROUTE } from '../../src/vacuum/live-route';
import {
  MAP_UNREADABLE_NAME,
  NO_POSE_TEXT,
  POSE_TEXT,
  VacuumMapPublication,
} from '../../src/vacuum/map-publication';
import { captureLogs, testLogger, type CapturedLogs } from '../support/logs';

const NOW = new Date('2026-10-24T10:00:00.000Z');
const ROBOT = 'robot';

let logs: CapturedLogs;
let states: StateUpdate[];
let events: DeviceEvent[];
let publication: VacuumMapPublication;

function scene(slot: VacuumScene['slot'], index: number): VacuumScene {
  return VACUUM_SCENE.parse({
    index,
    slot,
    name: 'Home',
    fetchedAt: NOW.toISOString(),
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    rooms: [],
    walls: [],
    doors: [],
    carpets: [],
    furniture: [],
    objects: [],
    zones: [],
    dock: null,
    robot: null,
    trail: [],
  });
}

beforeEach(() => {
  logs = captureLogs();
  states = [];
  events = [];
  publication = new VacuumMapPublication({
    state: (update): void => {
      states.push(update);
    },
    event: (event): void => {
      events.push(event);
    },
    now: (): Date => NOW,
    log: testLogger('publication'),
  });
});

describe('the map version', () => {
  it('publishes index:slot of the current map as raw:vacuum_map', () => {
    publication.published(ROBOT, scene('current', 1700));
    expect(states).toEqual([
      {
        externalId: ROBOT,
        capability: VACUUM_MAP_KEY,
        value: '1700:current',
        observedAt: NOW.toISOString(),
      },
    ]);
  });

  it('does not move the version for saved maps and backups', () => {
    publication.published(ROBOT, scene('saved', 1));
    publication.published(ROBOT, scene('backup', 2));
    expect(states).toHaveLength(0);
  });
});

describe('the saved robot maps', () => {
  const summaries = [
    { robotMapId: 1, name: 'Alpha', isCurrent: false, rooms: 3, version: '9:saved:1' },
    { robotMapId: 2, name: 'Beta', isCurrent: true, rooms: 5, version: '9:saved:2' },
  ];

  it('publishes the summaries as raw:vacuum_saved_maps and nothing on raw:vacuum_map', () => {
    publication.savedMaps(ROBOT, summaries);
    expect(states).toEqual([
      {
        externalId: ROBOT,
        capability: VACUUM_SAVED_MAPS_KEY,
        value: JSON.stringify(summaries),
        observedAt: NOW.toISOString(),
      },
    ]);
    expect(VACUUM_SAVED_MAPS.parse(JSON.parse(z.string().parse(states[0]?.value)))).toEqual(
      summaries,
    );
    expect(VACUUM_SAVED_MAPS_KEY).not.toBe(VACUUM_MAP_KEY);
  });

  it('leaves the current publication unchanged when the scene carries a robot map id', () => {
    publication.published(ROBOT, { ...scene('current', 1700), robotMapId: 2 });
    publication.published(ROBOT, { ...scene('saved', 1700), robotMapId: 2, isCurrent: true });
    expect(states).toEqual([
      {
        externalId: ROBOT,
        capability: VACUUM_MAP_KEY,
        value: '1700:current',
        observedAt: NOW.toISOString(),
      },
    ]);
  });
});

describe('the robot pose', () => {
  it('publishes metres, radians and the route cursor as raw:vacuum_pose', () => {
    publication.pose(ROBOT, {
      route: { cursor: 12, points: [] },
      pose: { x: 1.2, y: -0.4, yaw: 1.5 },
    });
    const update = states[0];
    expect(update?.capability).toBe(VACUUM_POSE_KEY);
    expect(POSE_TEXT.parse(JSON.parse(z.string().parse(update?.value)))).toEqual({
      x: 1.2,
      y: -0.4,
      yaw: 1.5,
      cursor: 12,
    });
  });

  it('publishes an empty text when the route was reset', () => {
    publication.pose(ROBOT, { route: EMPTY_ROUTE, pose: null });
    expect(states[0]?.value).toBe(NO_POSE_TEXT);
  });
});

describe('an unreadable map', () => {
  it('becomes one activity notice with the stage and the last good map', () => {
    publication.unreadable({
      deviceId: ROBOT,
      slot: 'current',
      index: 1701,
      stage: 'decode',
      robotMapId: null,
      lastGood: { index: 1700, fetchedAt: '2026-10-24T09:58:00.000Z' },
    });
    expect(events).toEqual([
      {
        externalId: ROBOT,
        kind: 'activity',
        occurredAt: NOW.toISOString(),
        occurrence: 'vacuum:robot:map:current:1701',
        details: {
          family: 'vacuum',
          name: MAP_UNREADABLE_NAME,
          slot: 'current',
          index: 1701,
          robotMapId: null,
          stage: 'decode',
          lastGoodIndex: 1700,
          lastGoodAt: '2026-10-24T09:58:00.000Z',
        },
      },
    ]);
    expect(logs.events()).toContain('vacuum_map.unreadable_notice');
  });

  it('says there is no good map when none was cached', () => {
    publication.unreadable({
      deviceId: ROBOT,
      slot: 'current',
      index: 1,
      stage: 'scene',
      robotMapId: null,
      lastGood: null,
    });
    expect(events[0]?.details).toMatchObject({ lastGoodIndex: null, lastGoodAt: null });
  });

  it('keeps one notice per robot map for the same list index', () => {
    const failure = {
      deviceId: ROBOT,
      slot: 'saved',
      index: 5,
      stage: 'decode',
      lastGood: null,
    } as const;
    publication.unreadable({ ...failure, robotMapId: 1 });
    publication.unreadable({ ...failure, robotMapId: 2 });
    expect(events.map((event) => event.occurrence)).toStrictEqual([
      'vacuum:robot:map:saved:1:5',
      'vacuum:robot:map:saved:2:5',
    ]);
  });
});
