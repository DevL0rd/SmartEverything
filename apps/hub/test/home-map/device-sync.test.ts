import {
  homeMapPointInPolygon,
  type DeviceRow,
  type HomeMapOp,
  type HomeMapPlacement,
  type LiveChange,
  type RowOperation,
} from '@smarteverything/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEVICE_SYNC_ACTOR, HomeMapDeviceSync } from '../../src/home-map/device-sync';
import type { HomeMapService } from '../../src/home-map/service';
import { ChangeFeed } from '../../src/store/feed';
import { captureLogs, testLogger, type CapturedLogs } from '../support/logs';
import { NOW } from './import-fixtures';
import { HOME_DEN, HOME_HALL, storedService } from './store-fixtures';

const FLOOR = 'ground';
const HALL_ROOM = 'map-hall';
const DEN_ROOM = 'map-den';
const FLOOR_LAMP = 'dev.light.floor-lamp';

let logs: CapturedLogs;
let service: HomeMapService;
let devices: DeviceRow[];
let models: Map<string, string>;
let sync: HomeMapDeviceSync;

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const device = (n: number, kind: DeviceRow['kind'], roomId: string | null): DeviceRow => ({
  id: uuid(n),
  provider: 'tuya',
  external_id: `ext-${String(n)}`,
  parent_id: null,
  kind,
  name: `Device ${String(n)}`,
  display_name: null,
  model: `model-${String(n)}`,
  manufacturer: 'Maker',
  provider_room: null,
  room_id: roomId,
  online: true,
  capabilities: [],
  details: {},
  hidden: false,
  favourite: false,
  position: n,
  created_at: NOW,
  updated_at: NOW,
});

interface Block {
  readonly id: string;
  readonly name: string;
  readonly homeRoomId: string;
  readonly x0: number;
  readonly x1: number;
}

const room = ({ id, name, homeRoomId, x0, x1 }: Block): HomeMapOp => ({
  op: 'add',
  kind: 'room',
  floorId: FLOOR,
  element: {
    id,
    name,
    homeRoomId,
    polygon: {
      outer: [
        { x: x0, y: 0 },
        { x: x1, y: 0 },
        { x: x1, y: 3 },
        { x: x0, y: 3 },
      ],
      holes: [],
    },
    labelAt: { x: x0 + 1, y: 1 },
    colourSlot: 1,
    floorMaterial: { kind: 'wood', variant: null, tint: null },
    wallPaint: null,
    ceilingHeight: null,
    origin: { kind: 'hand' },
  },
});

const handMap = (): void => {
  service.apply(
    [
      {
        op: 'addFloor',
        floor: {
          id: FLOOR,
          name: 'Ground',
          level: 0,
          elevation: 0,
          ceilingHeight: 2.6,
          rooms: [],
          walls: [],
          openings: [],
          objects: [],
          placements: [],
          annotations: [],
        },
      },
      room({ id: HALL_ROOM, name: 'Hall', homeRoomId: HOME_HALL, x0: 0, x1: 4 }),
      room({ id: DEN_ROOM, name: 'Den', homeRoomId: HOME_DEN, x0: 4.1, x1: 8.1 }),
    ],
    'profile:me',
  );
};

const placements = (): HomeMapPlacement[] =>
  service.get().floors.flatMap((entry) => entry.placements);

const placementOf = (row: DeviceRow): HomeMapPlacement | undefined =>
  placements().find((entry) => entry.deviceId === row.id);

const inside = (roomId: string, placement: HomeMapPlacement | undefined): boolean => {
  const found = service
    .get()
    .floors.flatMap((entry) => entry.rooms)
    .find((entry) => entry.id === roomId);
  return (
    placement !== undefined &&
    found !== undefined &&
    homeMapPointInPolygon(found.polygon, placement.at)
  );
};

let seq = 0;

const rowChange = (
  operation: RowOperation,
  record: DeviceRow | null,
  oldRecord: DeviceRow | null,
): LiveChange => ({
  type: 'change',
  table: 'devices',
  operation,
  record,
  oldRecord,
  seq: (seq += 1),
});

const arrive = (row: DeviceRow): void => {
  devices.push(row);
  sync.handle(rowChange('INSERT', row, null));
};

beforeEach(() => {
  logs = captureLogs();
  service = storedService();
  devices = [];
  models = new Map();
  handMap();
  sync = new HomeMapDeviceSync({
    maps: service,
    devices: { list: (): readonly DeviceRow[] => devices },
    modelOf: (row): string | null => models.get(row.id) ?? null,
    log: testLogger('home-map'),
  });
});

describe('a device that arrives in a room that is on the map', () => {
  it('is placed inside that room by the hub, as an automatic placement, in one revision', () => {
    const before = service.revision();
    const lamp = device(1, 'light', HOME_HALL);
    models.set(lamp.id, FLOOR_LAMP);
    arrive(lamp);
    const placed = placementOf(lamp);
    expect(inside(HALL_ROOM, placed)).toBe(true);
    expect(placed).toMatchObject({ auto: true, mount: 'floor', floorId: FLOOR, height: 0 });
    expect(service.revision()).toBe(before + 1);
    expect(service.revisions({ after: before }).map((entry) => entry.actor)).toEqual([
      DEVICE_SYNC_ACTOR,
    ]);
  });

  it('takes the mount from the real placement facts of its model, and from its family without one', () => {
    const lamp = device(1, 'light', HOME_HALL);
    models.set(lamp.id, FLOOR_LAMP);
    const bulb = device(2, 'light', HOME_HALL);
    arrive(lamp);
    arrive(bulb);
    expect(placementOf(lamp)?.mount).toBe('floor');
    expect(placementOf(bulb)).toMatchObject({ mount: 'ceiling', height: 2.6 });
  });

  it('leaves the map alone when its room has no place on the map or it has no room', () => {
    const before = service.revision();
    arrive(device(1, 'light', uuid(900)));
    arrive(device(2, 'light', null));
    expect(service.revision()).toBe(before);
    expect(placements()).toEqual([]);
  });

  it('places devices through the change feed without anyone calling it', () => {
    const feed = new ChangeFeed(testLogger('feed'));
    const stop = sync.start(feed);
    const lamp = device(1, 'light', HOME_HALL);
    devices.push(lamp);
    feed.emit(rowChange('INSERT', lamp, null));
    expect(inside(HALL_ROOM, placementOf(lamp))).toBe(true);
    stop();
    const other = device(2, 'light', HOME_HALL);
    devices.push(other);
    feed.emit(rowChange('INSERT', other, null));
    expect(placementOf(other)).toBeUndefined();
  });
});

describe('a device that changes room', () => {
  it('moves into the new room when its place lies outside it', () => {
    const lamp = device(1, 'light', HOME_HALL);
    arrive(lamp);
    const moved = { ...lamp, room_id: HOME_DEN };
    sync.handle(rowChange('UPDATE', moved, lamp));
    const placed = placementOf(lamp);
    expect(inside(DEN_ROOM, placed)).toBe(true);
    expect(placements()).toHaveLength(1);
  });

  it('keeps the place when it already lies inside the new room', () => {
    const lamp = device(1, 'light', HOME_HALL);
    arrive(lamp);
    const before = service.revision();
    const moved = { ...lamp, room_id: HOME_HALL };
    sync.handle(rowChange('UPDATE', moved, { ...lamp, room_id: HOME_DEN }));
    expect(service.revision()).toBe(before);
  });

  it('does nothing for an update that did not change its room', () => {
    const lamp = device(1, 'light', HOME_HALL);
    arrive(lamp);
    const before = service.revision();
    sync.handle(rowChange('UPDATE', { ...lamp, online: false }, lamp));
    expect(service.revision()).toBe(before);
  });

  it('never moves a hand placed device when its room changes', () => {
    const lamp = device(1, 'light', HOME_HALL);
    arrive(lamp);
    service.apply(
      [
        {
          op: 'update',
          kind: 'placement',
          floorId: FLOOR,
          id: lamp.id,
          patch: { at: { x: 1, y: 1 }, auto: false },
        },
      ],
      'profile:me',
    );
    const before = service.revision();
    sync.handle(rowChange('UPDATE', { ...lamp, room_id: HOME_DEN }, lamp));
    expect(placementOf(lamp)).toMatchObject({ at: { x: 1, y: 1 }, auto: false });
    expect(service.revision()).toBe(before);
  });

  it('still moves an automatic placement into the new room', () => {
    const lamp = device(1, 'light', HOME_HALL);
    arrive(lamp);
    expect(placementOf(lamp)?.auto).toBe(true);
    sync.handle(rowChange('UPDATE', { ...lamp, room_id: HOME_DEN }, lamp));
    expect(placementOf(lamp)).toMatchObject({ auto: true });
    expect(inside(DEN_ROOM, placementOf(lamp))).toBe(true);
  });

  it('returns an automatic placement to the tray when the new room is not on the map or there is none', () => {
    const lamp = device(1, 'light', HOME_HALL);
    arrive(lamp);
    sync.handle(rowChange('UPDATE', { ...lamp, room_id: uuid(900) }, lamp));
    expect(placementOf(lamp)).toBeUndefined();
    const other = device(2, 'light', HOME_HALL);
    arrive(other);
    sync.handle(rowChange('UPDATE', { ...other, room_id: null }, other));
    expect(placementOf(other)).toBeUndefined();
    expect(placements()).toEqual([]);
  });

  it('keeps a hand placement where it is when its room leaves the map', () => {
    const lamp = device(1, 'light', HOME_HALL);
    arrive(lamp);
    service.apply(
      [
        {
          op: 'update',
          kind: 'placement',
          floorId: FLOOR,
          id: lamp.id,
          patch: { at: { x: 1, y: 1 }, auto: false },
        },
      ],
      'profile:me',
    );
    sync.handle(rowChange('UPDATE', { ...lamp, room_id: null }, lamp));
    expect(placementOf(lamp)).toMatchObject({ at: { x: 1, y: 1 }, auto: false });
  });
});

describe('removals', () => {
  it('removes the place of a device that is deleted', () => {
    const lamp = device(1, 'light', HOME_HALL);
    arrive(lamp);
    sync.handle(rowChange('DELETE', null, lamp));
    expect(placementOf(lamp)).toBeUndefined();
  });

  it('ignores the deletion of a device that was never placed', () => {
    const before = service.revision();
    sync.handle(rowChange('DELETE', null, device(1, 'light', null)));
    expect(service.revision()).toBe(before);
  });

  it('lets a room that is deleted lose its link and keep its name and shape', () => {
    sync.handle({
      type: 'change',
      table: 'rooms',
      operation: 'DELETE',
      record: null,
      oldRecord: { id: HOME_HALL, name: 'Hall', position: 0 },
      seq: (seq += 1),
    });
    const rooms = service.get().floors.flatMap((entry) => entry.rooms);
    expect(rooms.find((entry) => entry.id === HALL_ROOM)).toMatchObject({
      name: 'Hall',
      homeRoomId: null,
    });
    expect(rooms.find((entry) => entry.id === DEN_ROOM)?.homeRoomId).toBe(HOME_DEN);
  });
});

describe('placing on request', () => {
  it('places only the devices that have no place, for one room, and never moves a placed one', () => {
    const handPlaced = device(1, 'light', HOME_HALL);
    arrive(handPlaced);
    service.apply(
      [
        {
          op: 'update',
          kind: 'placement',
          floorId: FLOOR,
          id: handPlaced.id,
          patch: { at: { x: 3.5, y: 2.5 }, auto: false },
        },
      ],
      'profile:me',
    );
    const waiting = device(2, 'light', HOME_HALL);
    const elsewhere = device(3, 'light', HOME_DEN);
    devices.push(waiting, elsewhere);
    const outcome = sync.place({ roomId: HOME_HALL }, 'profile:me');
    expect(outcome.placed).toBe(1);
    expect(outcome.revision).toBe(service.revision());
    expect(inside(HALL_ROOM, placementOf(waiting))).toBe(true);
    expect(placementOf(elsewhere)).toBeUndefined();
    expect(placementOf(handPlaced)).toMatchObject({ at: { x: 3.5, y: 2.5 }, auto: false });
    expect(service.revisions({ after: outcome.revision - 1 })[0]?.actor).toBe('profile:me');
  });

  it('places the devices named, and every unplaced one when none are named', () => {
    const a = device(1, 'light', HOME_HALL);
    const b = device(2, 'light', HOME_DEN);
    devices.push(a, b);
    expect(sync.place({ deviceIds: [b.id] }, 'ai:me').placed).toBe(1);
    expect(placementOf(a)).toBeUndefined();
    expect(sync.place({}, 'ai:me').placed).toBe(1);
    expect(placements()).toHaveLength(2);
  });

  it('answers the current revision when nothing needed placing', () => {
    const before = service.revision();
    expect(sync.place({}, 'profile:me')).toEqual({ revision: before, placed: 0 });
  });

  it('gives the same result whatever order the devices come in', () => {
    const rows = [1, 2, 3, 4].map((n) => device(n, 'light', HOME_HALL));
    devices.push(...rows);
    sync.place({}, 'profile:me');
    const forward = rows.map((row) => placementOf(row)?.at);
    const other = storedService();
    other.apply(service.revisions()[0]?.ops ?? [], 'profile:me');
    const reversed = new HomeMapDeviceSync({
      maps: other,
      devices: { list: (): readonly DeviceRow[] => [...rows].reverse() },
      modelOf: (): null => null,
      log: testLogger('home-map'),
    });
    reversed.place({}, 'profile:me');
    const backward = rows.map(
      (row) =>
        other
          .get()
          .floors.flatMap((entry) => entry.placements)
          .find((p) => p.deviceId === row.id)?.at,
    );
    expect(backward).toEqual(forward);
  });

  it('leaves a device with no free place in the tray and says so in the log', () => {
    const lamps = Array.from({ length: 40 }, (_, index) =>
      device(index + 1, 'air_purifier', HOME_HALL),
    );
    devices.push(...lamps);
    const outcome = sync.place({ roomId: HOME_HALL }, 'profile:me');
    expect(
      outcome.placed + logs.events().filter((event) => event === 'home_map.device_unplaced').length,
    ).toBe(lamps.length);
  });
});
