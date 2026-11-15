import { API_ENDPOINTS as E } from '@smarteverything/domain';
import type { Counted, SeedContext } from './context.ts';
import { ROOMS } from './device-specs.ts';

const COLUMNS = 4;
const SIZE = 4;

interface Corner {
  readonly x: number;
  readonly y: number;
}

type Square = readonly [Corner, Corner, Corner, Corner];

const hand = { kind: 'hand' } as const;

function edge(from: Corner, to: Corner): string {
  return [from, to]
    .map((corner) => `${String(corner.x)}_${String(corner.y)}`)
    .sort()
    .join('-');
}

function squareAt(index: number): Square {
  const x = (index % COLUMNS) * SIZE;
  const y = Math.floor(index / COLUMNS) * SIZE;
  return [
    { x, y },
    { x: x + SIZE, y },
    { x: x + SIZE, y: y + SIZE },
    { x, y: y + SIZE },
  ];
}

function roomsOf(homeRooms: ReadonlyMap<string, string>): Record<string, unknown>[] {
  return ROOMS.map((name, index) => {
    const square = squareAt(index);
    return {
      id: `room-${String(index + 1)}`,
      name,
      homeRoomId: homeRooms.get(name) ?? null,
      polygon: { outer: [...square], holes: [] },
      labelAt: { x: square[0].x + SIZE / 2, y: square[0].y + SIZE / 2 },
      colourSlot: (index % 8) + 1,
      floorMaterial: { kind: index % 2 === 0 ? 'wood' : 'tile', variant: null, tint: null },
      wallPaint: null,
      ceilingHeight: null,
      origin: hand,
    };
  });
}

function wallsOf(): { walls: Record<string, unknown>[]; ids: Map<string, string> } {
  const walls: Record<string, unknown>[] = [];
  const ids = new Map<string, string>();
  for (const [index] of ROOMS.entries()) {
    const [a, b, c, d] = squareAt(index);
    for (const [from, to] of [
      [a, b],
      [b, c],
      [c, d],
      [d, a],
    ] as const) {
      const key = edge(from, to);
      if (ids.has(key)) continue;
      const id = `wall-${String(walls.length + 1)}`;
      ids.set(key, id);
      walls.push({ id, from, to, thickness: 0.15, height: null, kind: 'solid', origin: hand });
    }
  }
  return { walls, ids };
}

function openingsOf(wallIds: ReadonlyMap<string, string>): Record<string, unknown>[] {
  const openings: Record<string, unknown>[] = [];
  for (const [index] of ROOMS.entries()) {
    if (index % COLUMNS === COLUMNS - 1 || index + 1 >= ROOMS.length) continue;
    const [, b, c] = squareAt(index);
    const wallId = wallIds.get(edge(b, c));
    if (wallId === undefined) continue;
    openings.push({
      id: `opening-${String(openings.length + 1)}`,
      wallId,
      offset: 1.5,
      width: 0.9,
      kind: 'door',
      sillHeight: 0,
      headHeight: 2.05,
      hinge: 'left',
      swing: 'in',
      contactDeviceId: null,
      lockDeviceId: null,
      origin: hand,
    });
  }
  return openings;
}

export async function seedHomeMap(context: SeedContext): Promise<Counted> {
  const { api } = context;
  const snapshot = await api.call(E.readSnapshot, { query: {} });
  const homeRooms = new Map(snapshot.tables.rooms.map((room) => [room.name, room.id] as const));
  const rooms = roomsOf(homeRooms);
  const { walls, ids } = wallsOf();
  const openings = openingsOf(ids);
  const map = await api.call(E.getHomeMap, { query: { view: 'full' } });
  const result = await api.call(E.editHomeMap, {
    query: {},
    body: {
      baseRevision: 'revision' in map ? map.revision : 0,
      ops: [
        {
          op: 'addFloor',
          floor: {
            id: 'floor-ground',
            name: 'Ground floor',
            level: 0,
            elevation: 0,
            ceilingHeight: 2.6,
            rooms,
            walls,
            openings,
            objects: [],
            placements: [],
            annotations: [
              { id: 'note-1', kind: 'note', at: { x: 2, y: 6 }, text: 'Synthetic test map' },
            ],
          },
        },
      ],
    },
  });
  if (result.conflicts.length > 0)
    throw new Error(`The home map edit was refused: ${JSON.stringify(result.conflicts)}`);
  const placed = await api.call(E.placeHomeMapDevices, { query: {}, body: {} });
  return {
    rooms: rooms.length,
    walls: walls.length,
    openings: openings.length,
    placed: placed.placed,
  };
}
