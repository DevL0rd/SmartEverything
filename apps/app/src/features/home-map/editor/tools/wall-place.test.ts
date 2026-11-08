import { describe, expect, it } from 'vitest';
import { HOME_MAP_OBJECT_WRITE, placementFacts, type HomeMapRoom } from '@smarteverything/domain';
import {
  ATTACHED,
  BIG,
  BOTTOM,
  RIGHT,
  SHELF,
  SHELF_ID,
  VASE,
  row,
  shelf,
  wallFloor,
  wallSpecOf,
} from './wall-fixture';
import {
  OUTSIDE_SIDE_TEXT,
  WALL_GRID_M,
  facingOf,
  isWallModel,
  stepOffset,
  wallAttachPatch,
  wallMovePatch,
  wallOf,
  wallPlaceOp,
  wallRowIds,
  wallSpotAt,
} from './wall-place';
import { wallSeat } from '../../../../components/house-map/edit/wall-seat';

const SIZE = { width: 0.8, depth: 0.25 };

function bigRoom(): HomeMapRoom {
  const room = wallFloor().rooms.find((each) => each.id === BIG);
  if (room === undefined) throw new Error('no room');
  return room;
}

describe('wall placing', () => {
  it('snaps to the nearest wall and faces into the room the point is in', () => {
    const spot = wallSpotAt(wallFloor(), { x: 2, y: 1 }, SIZE);
    expect(spot?.wall).toEqual({ wallId: BOTTOM, offset: 2, side: 'left' });
    expect(spot?.rotation).toBe(90);
    expect(spot?.at.x).toBeCloseTo(2);
    expect(spot?.at.y).toBeCloseTo(0.05 + 0.125);
  });

  it('dragging to another wall moves it there and refaces it', () => {
    const floor = wallFloor([shelf({ wall: ATTACHED })]);
    const object = floor.objects[0];
    if (object === undefined) throw new Error('no object');
    const patch = wallMovePatch(floor, object, { x: 4.6, y: 3 }, wallSpecOf);
    expect(patch?.wall).toMatchObject({ wallId: RIGHT, side: 'left' });
    expect(patch?.rotation).toBe(180);
    expect(patch?.at?.x).toBeCloseTo(5 - 0.05 - 0.125);
  });

  it('seats on a wall through the one shared seat: kept on the wall, off the face by half its depth', () => {
    const wall = wallOf(wallFloor(), BOTTOM);
    if (wall === null) throw new Error('no wall');
    const spot = wallSeat(wall, { ...ATTACHED, offset: 4.9 }, SIZE);
    expect(spot?.wall.offset).toBe(4.6);
    expect(spot?.at.y).toBeCloseTo(0.05 + 0.125);
    expect(wallSeat(wall, ATTACHED, { width: 9, depth: 0 })?.wall.offset).toBe(2.5);
  });

  it('keeps the whole object on its wall when the offset runs past an end', () => {
    expect(wallAttachPatch(wallFloor(), ATTACHED, { offset: 0 }, SIZE)?.wall.offset).toBe(0.4);
    expect(wallAttachPatch(wallFloor(), ATTACHED, { offset: 9 }, SIZE)?.wall.offset).toBe(4.6);
  });

  it('turning to the other side flips the facing', () => {
    const spot = wallAttachPatch(wallFloor(), ATTACHED, { side: 'right' }, SIZE);
    expect(spot?.rotation).toBe(270);
    expect(spot?.at.y).toBeCloseTo(-0.175);
  });

  it('places a catalogue wall object on a wall at its model default mount height', () => {
    const floor = wallFloor();
    const input = { floor, room: bigRoom(), modelId: SHELF.id, spec: SHELF, id: SHELF_ID };
    const op = wallPlaceOp({ ...input, specOf: wallSpecOf });
    if (op?.op !== 'add' || op.kind !== 'object') throw new Error('not an add');
    const element = HOME_MAP_OBJECT_WRITE.parse(op.element);
    expect(element.wall?.wallId === BOTTOM || element.wall?.wallId === RIGHT).toBe(true);
    expect(element.elevation).toBe(placementFacts(SHELF.id, SHELF)?.defaultHeightM);
  });

  it('the wall objects category holds only models with a wall mount anchor', () => {
    const rows = [row(SHELF.id, 'Floating shelf', 'b'), row(VASE.id, 'Vase', 'a')];
    const specs = rows.map((each) => {
      const value = wallSpecOf(each.id);
      return value === undefined
        ? { status: 'idle' as const }
        : { status: 'ready' as const, value };
    });
    expect([...wallRowIds(rows, specs)]).toEqual([SHELF.id]);
    expect(isWallModel(SHELF.id, SHELF)).toBe(true);
  });

  it('names the room it faces, and outside when no room is on that side', () => {
    const floor = wallFloor();
    const wall = wallOf(floor, BOTTOM);
    if (wall === null) throw new Error('no wall');
    expect(facingOf(floor, wall, ATTACHED, [])).toBe('Into Living room');
    expect(facingOf(floor, wall, { ...ATTACHED, side: 'right' }, [])).toBe(OUTSIDE_SIDE_TEXT);
  });

  it('rounds offsets to the 10 cm grid', () => {
    expect(stepOffset(1.234, WALL_GRID_M)).toBeCloseTo(1.2);
  });
});
