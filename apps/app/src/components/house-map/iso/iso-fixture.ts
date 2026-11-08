import type {
  RenderFloor,
  RenderObject,
  RenderPlacement,
  RenderPoint,
  RenderRoom,
  RenderWall,
} from '../render-scene';

const square = (minX: number, minY: number, maxX: number, maxY: number): readonly RenderPoint[] => [
  { x: minX, y: minY },
  { x: maxX, y: minY },
  { x: maxX, y: maxY },
  { x: minX, y: maxY },
];

export function isoRoom(id: string, minX: number, maxX: number): RenderRoom {
  return {
    id,
    name: id,
    homeRoomId: null,
    polygons: [{ outer: square(minX, 0, maxX, 4), holes: [] }],
    labelAt: { x: (minX + maxX) / 2, y: 2 },
    colourSlot: 1,
    floor: { status: 'none' },
    wallPaint: null,
    ceilingHeight: 2.5,
    areaM2: (maxX - minX) * 4,
    hidden: false,
  };
}

export function isoWall(
  id: string,
  from: readonly [number, number],
  to: readonly [number, number],
): RenderWall {
  return {
    id,
    from: { x: from[0], y: from[1] },
    to: { x: to[0], y: to[1] },
    thickness: 0.1,
    height: 2.5,
    kind: 'solid',
    exterior: true,
  };
}

export function isoObject(id: string, x: number, y: number, modelId: string | null): RenderObject {
  return {
    id,
    modelId,
    kind: 'sofa',
    label: null,
    finish: null,
    params: { width: 1, depth: 0.6 },
    at: { x, y },
    rotationDeg: 0,
    elevation: 0,
    footprint: null,
    height: 0.8,
    locked: false,
    roomId: 'a',
    wall: null,
  };
}

export function isoLight(deviceId: string, x: number, roomId: string): RenderPlacement {
  return {
    deviceId,
    name: deviceId,
    kind: 'light',
    at: { x, y: 2 },
    rotationDeg: 0,
    height: 2.4,
    tiltDeg: 0,
    mount: 'ceiling',
    auto: true,
    camera: null,
    roomId,
    wall: null,
  };
}

export function isoHouse(): RenderFloor {
  return {
    id: 'ground',
    name: 'Ground',
    level: 0,
    elevation: 0,
    ceilingHeight: 2.5,
    bounds: { minX: 0, minY: 0, maxX: 8, maxY: 4 },
    rooms: [isoRoom('a', 0, 4), isoRoom('b', 4, 8)],
    walls: [
      isoWall('south', [0, 0], [8, 0]),
      isoWall('east', [8, 0], [8, 4]),
      isoWall('north', [8, 4], [0, 4]),
      isoWall('west', [0, 4], [0, 0]),
    ],
    openings: [],
    objects: [isoObject('sofa', 1, 1, 'cat.living.sofa'), isoObject('far', 3, 3, null)],
    placements: [isoLight('lamp-a', 2, 'a'), isoLight('lamp-b', 6, 'b')],
    carpets: [],
    markers: [],
    measures: [],
    vacuum: {
      dock: null,
      robot: { x: 6, y: 1, yawDeg: 90 },
      trail: [],
      zones: [],
    },
  };
}
