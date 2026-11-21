import { describe, expect, it } from 'vitest';
import type { OverlayZoneFill } from '../overlays/model-types';
import { isoHouse } from './iso-fixture';
import { buildIsoSolids, isoOccupancy, type IsoStillInput } from './model';

const viewport = { width: 400, height: 240 };

const zone = (occupied: boolean): OverlayZoneFill => ({
  id: 'z',
  deviceId: 'shelly',
  occupied,
  polygons: [
    {
      outer: [
        { x: 5, y: 1 },
        { x: 6, y: 1 },
        { x: 6, y: 2 },
      ],
      holes: [],
    },
  ],
});

describe('buildIsoSolids', () => {
  it('builds the same solids for inputs that differ only in occupancy', () => {
    const floor = isoHouse();
    const empty: IsoStillInput = { floor, litDeviceIds: ['lamp-a'] };
    const busy: IsoStillInput = {
      floor,
      litDeviceIds: ['lamp-a'],
      activeRoomIds: ['b'],
      zones: [zone(true)],
    };
    const scene = buildIsoSolids(empty, viewport);
    const quiet = isoOccupancy(scene, empty);
    const occupied = isoOccupancy(scene, busy);
    expect(scene.solids.length).toBeGreaterThan(0);
    expect(quiet.rooms.map((room) => room.active)).toEqual([false, false]);
    expect(occupied.rooms.map((room) => room.active)).toEqual([false, true]);
    expect(occupied.zones.map((shape) => shape.occupied)).toEqual([true]);
    expect(isoOccupancy(scene, { zones: [zone(false)] }).zones[0]?.occupied).toBe(false);
    expect(buildIsoSolids(busy, viewport).solids.map((solid) => solid.id)).toEqual(
      scene.solids.map((solid) => solid.id),
    );
  });
});
