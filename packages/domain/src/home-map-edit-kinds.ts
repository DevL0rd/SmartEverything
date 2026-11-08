import { z } from 'zod';
import type { HomeMap, HomeMapFloor } from './home-map';
import type { HomeMapConflictReason, HomeMapEditKind } from './home-map-edit-ops';
import {
  HOME_MAP_ANNOTATION,
  HOME_MAP_ANNOTATION_WRITE,
  HOME_MAP_OBJECT,
  HOME_MAP_OBJECT_WRITE,
  HOME_MAP_OPENING,
  HOME_MAP_OPENING_WRITE,
  HOME_MAP_ROOM,
  HOME_MAP_ROOM_WRITE,
  HOME_MAP_WALL,
  HOME_MAP_WALL_WRITE,
  type HomeMapPoint,
} from './home-map-elements';
import { HOME_MAP_PLACEMENT, HOME_MAP_PLACEMENT_WRITE } from './home-map-placement';
import {
  HOME_MAP_NOTICE,
  HOME_MAP_NOTICE_WRITE,
  HOME_MAP_SOURCE,
  HOME_MAP_SOURCE_WRITE,
} from './home-map-source';

export type EditRecord = Readonly<Record<string, unknown>>;

type Shift = (
  element: EditRecord,
  dx: number,
  dy: number,
  floor: HomeMapFloor | undefined,
) => EditRecord | 'locked' | null;

export interface EditKind {
  readonly key: 'id' | 'deviceId';
  readonly write: z.ZodType<EditRecord>;
  readonly patch: z.ZodType<EditRecord>;
  readonly shift: Shift | null;
  readonly global: ((map: HomeMap, id: string) => boolean) | null;
  readonly requires: (
    map: HomeMap,
    floorId: string | undefined,
    element: EditRecord,
  ) => HomeMapConflictReason | null;
  readonly list: (map: HomeMap, floorId: string | undefined) => readonly EditRecord[] | null;
  readonly put: (
    map: HomeMap,
    floorId: string | undefined,
    list: readonly EditRecord[],
  ) => HomeMap | null;
}

type FloorList = 'rooms' | 'walls' | 'openings' | 'objects' | 'placements' | 'annotations';

type KindParts = Pick<EditKind, 'write' | 'patch'> &
  Partial<Pick<EditKind, 'key' | 'shift' | 'global' | 'requires'>>;

const NO_REQUIREMENT: EditKind['requires'] = () => null;

function floorKind<K extends FloorList>(
  listKey: K,
  reader: z.ZodType<HomeMapFloor[K]>,
  parts: KindParts,
): EditKind {
  return {
    key: 'id',
    shift: null,
    global: null,
    requires: NO_REQUIREMENT,
    ...parts,
    list: (map, floorId): readonly EditRecord[] | null =>
      map.floors.find((floor) => floor.id === floorId)?.[listKey] ?? null,
    put: (map, floorId, list): HomeMap | null => {
      const parsed = reader.safeParse(list);
      if (!parsed.success) return null;
      const floors = map.floors.map((floor) =>
        floor.id === floorId ? { ...floor, [listKey]: parsed.data } : floor,
      );
      return { ...map, floors };
    },
  };
}

function mapKind<K extends 'sources' | 'notices'>(
  listKey: K,
  reader: z.ZodType<HomeMap[K]>,
  parts: KindParts,
): EditKind {
  return {
    key: 'id',
    shift: null,
    global: null,
    requires: NO_REQUIREMENT,
    ...parts,
    list: (map) => map[listKey],
    put: (map, _floorId, list): HomeMap | null => {
      const parsed = reader.safeParse(list);
      return parsed.success ? { ...map, [listKey]: parsed.data } : null;
    },
  };
}

function translate(point: HomeMapPoint, dx: number, dy: number): HomeMapPoint {
  return { ...point, x: point.x + dx, y: point.y + dy };
}

const shiftRoom: Shift = (element, dx, dy) => {
  const room = HOME_MAP_ROOM.safeParse(element);
  if (!room.success) return null;
  const { polygon, labelAt } = room.data;
  return {
    polygon: {
      ...polygon,
      outer: polygon.outer.map((point) => translate(point, dx, dy)),
      holes: polygon.holes.map((ring) => ring.map((point) => translate(point, dx, dy))),
    },
    labelAt: translate(labelAt, dx, dy),
  };
};

const shiftWall: Shift = (element, dx, dy) => {
  const wall = HOME_MAP_WALL.safeParse(element);
  if (!wall.success) return null;
  return { from: translate(wall.data.from, dx, dy), to: translate(wall.data.to, dx, dy) };
};

const shiftOpening: Shift = (element, dx, dy, floor) => {
  const opening = HOME_MAP_OPENING.safeParse(element);
  if (!opening.success) return null;
  const wall = floor?.walls.find((candidate) => candidate.id === opening.data.wallId);
  if (!wall) return null;
  const length = Math.hypot(wall.to.x - wall.from.x, wall.to.y - wall.from.y);
  if (length === 0) return null;
  const along = (dx * (wall.to.x - wall.from.x) + dy * (wall.to.y - wall.from.y)) / length;
  const furthest = Math.max(0, length - opening.data.width);
  return { offset: Math.min(furthest, Math.max(0, opening.data.offset + along)) };
};

const shiftObject: Shift = (element, dx, dy) => {
  const object = HOME_MAP_OBJECT.safeParse(element);
  if (!object.success) return null;
  return object.data.locked ? 'locked' : { at: translate(object.data.at, dx, dy) };
};

const shiftPlacement: Shift = (element, dx, dy) => {
  const placement = HOME_MAP_PLACEMENT.safeParse(element);
  if (!placement.success) return null;
  return { at: translate(placement.data.at, dx, dy), auto: false };
};

const shiftAnnotation: Shift = (element, dx, dy) => {
  const annotation = HOME_MAP_ANNOTATION.safeParse(element);
  if (!annotation.success) return null;
  if (annotation.data.kind === 'measure') {
    return {
      from: translate(annotation.data.from, dx, dy),
      to: translate(annotation.data.to, dx, dy),
    };
  }
  return { at: translate(annotation.data.at, dx, dy) };
};

const openingNeedsWall: EditKind['requires'] = (map, floorId, element) => {
  const floor = map.floors.find((candidate) => candidate.id === floorId);
  const found = floor?.walls.some((wall) => wall.id === element['wallId']) === true;
  return found ? null : 'missing_parent';
};

const placementNeedsFloor: EditKind['requires'] = (_map, floorId, element) =>
  element['floorId'] === floorId ? null : 'invalid';

const deviceTaken = (map: HomeMap, id: string): boolean =>
  map.floors.some((floor) => floor.placements.some((placement) => placement.deviceId === id));

export const EDIT_KINDS: Readonly<Record<HomeMapEditKind, EditKind>> = {
  room: floorKind('rooms', z.array(HOME_MAP_ROOM), {
    write: HOME_MAP_ROOM_WRITE,
    patch: HOME_MAP_ROOM_WRITE.partial(),
    shift: shiftRoom,
  }),
  wall: floorKind('walls', z.array(HOME_MAP_WALL), {
    write: HOME_MAP_WALL_WRITE,
    patch: HOME_MAP_WALL_WRITE.partial(),
    shift: shiftWall,
  }),
  opening: floorKind('openings', z.array(HOME_MAP_OPENING), {
    write: HOME_MAP_OPENING_WRITE,
    patch: HOME_MAP_OPENING_WRITE.partial(),
    shift: shiftOpening,
    requires: openingNeedsWall,
  }),
  object: floorKind('objects', z.array(HOME_MAP_OBJECT), {
    write: HOME_MAP_OBJECT_WRITE,
    patch: HOME_MAP_OBJECT_WRITE.partial(),
    shift: shiftObject,
  }),
  placement: floorKind('placements', z.array(HOME_MAP_PLACEMENT), {
    key: 'deviceId',
    write: HOME_MAP_PLACEMENT_WRITE,
    patch: HOME_MAP_PLACEMENT_WRITE.partial(),
    shift: shiftPlacement,
    global: deviceTaken,
    requires: placementNeedsFloor,
  }),
  annotation: floorKind('annotations', z.array(HOME_MAP_ANNOTATION), {
    write: HOME_MAP_ANNOTATION_WRITE,
    patch: z.union(HOME_MAP_ANNOTATION_WRITE.options.map((option) => option.partial())),
    shift: shiftAnnotation,
  }),
  source: mapKind('sources', z.array(HOME_MAP_SOURCE), {
    write: HOME_MAP_SOURCE_WRITE,
    patch: HOME_MAP_SOURCE_WRITE.partial(),
  }),
  notice: mapKind('notices', z.array(HOME_MAP_NOTICE), {
    write: HOME_MAP_NOTICE_WRITE,
    patch: HOME_MAP_NOTICE_WRITE.partial(),
  }),
};
