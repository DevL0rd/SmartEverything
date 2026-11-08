import { lightEmitterFacts, type LightState, type LightingInput } from './lighting';
import type { RenderFloor, RenderPlacement, RenderRoom } from './render-scene';

export function room(id: string, name: string, minX: number, maxX: number): RenderRoom {
  return {
    id,
    name,
    homeRoomId: null,
    polygons: [
      {
        outer: [
          { x: minX, y: 0 },
          { x: maxX, y: 0 },
          { x: maxX, y: 4 },
          { x: minX, y: 4 },
        ],
        holes: [],
      },
    ],
    labelAt: { x: (minX + maxX) / 2, y: 2 },
    colourSlot: 1,
    floor: { status: 'none' },
    wallPaint: null,
    ceilingHeight: 2.6,
    areaM2: (maxX - minX) * 4,
    hidden: false,
  };
}

export function placement(
  deviceId: string,
  x: number,
  y: number,
  extra: Partial<RenderPlacement> = {},
): RenderPlacement {
  return {
    deviceId,
    name: deviceId,
    kind: 'light',
    at: { x, y },
    rotationDeg: 0,
    height: 1.2,
    tiltDeg: 0,
    mount: 'ceiling',
    auto: true,
    camera: null,
    roomId: null,
    wall: null,
    ...extra,
  };
}

export function floorOf(placements: readonly RenderPlacement[]): RenderFloor {
  return {
    id: 'ground',
    name: 'Ground',
    level: 0,
    elevation: 0,
    ceilingHeight: 2.5,
    bounds: { minX: 0, minY: 0, maxX: 8, maxY: 4 },
    rooms: [room('kitchen', 'Kitchen', 0, 4), room('hall', 'Hall', 4, 8)],
    walls: [],
    openings: [],
    objects: [],
    placements,
    carpets: [],
    markers: [],
    measures: [],
    vacuum: null,
  };
}

export const ON: LightState = { on: true, brightness: 1, colour: null, colourTempK: null };

export function input(
  placements: readonly RenderPlacement[],
  lights: Readonly<Record<string, LightState>>,
  enabled = true,
): LightingInput {
  return {
    floor: floorOf(placements),
    enabled,
    lights: new Map(Object.entries(lights)),
    emitterOf: (item) => lightEmitterFacts(item.mount),
  };
}
