import { describe, expect, it } from 'vitest';
import { CUT_HEIGHT_METRES } from '../3d/cutaway';
import type { RenderRoom } from '../render-scene';
import { isoHouse, isoRoom } from './iso-fixture';
import {
  ISO_PADDING_PX,
  ellipsePath,
  fitIsoFrame,
  isoBasis,
  isoFloorFill,
  isoPixels,
  isoPlaneMatrix,
  isoPrism,
  isoProject,
  isoWallPieces,
  objectHeight,
  squareRing,
} from './project';

const basis = isoBasis();

const viewport = { width: 400, height: 240 };

const frame = fitIsoFrame(basis, { minX: 0, minY: 0, maxX: 8, maxY: 4 }, 2.5, viewport);

describe('iso projection', () => {
  it('raises taller points and lifts farther points up the screen', () => {
    const ground = isoProject(basis, { x: 2, y: 2 }, 0);
    expect(isoProject(basis, { x: 2, y: 2 }, 1).v).toBeLessThan(ground.v);
    expect(isoProject(basis, { x: 3, y: 3 }, 0).v).toBeLessThan(ground.v);
    expect(Math.hypot(basis.right.x, basis.right.y)).toBeCloseTo(1, 9);
    expect(basis.right.x * basis.forward.x + basis.right.y * basis.forward.y).toBeCloseTo(0, 9);
  });

  it('fits the whole house with its wall tops inside the padded viewport', () => {
    const corners = [0, 2.5].flatMap((z) =>
      [
        { x: 0, y: 0 },
        { x: 8, y: 0 },
        { x: 8, y: 4 },
        { x: 0, y: 4 },
      ].map((at) => isoPixels(frame, isoProject(basis, at, z))),
    );
    for (const corner of corners) {
      expect(corner.u).toBeGreaterThanOrEqual(ISO_PADDING_PX - 0.01);
      expect(corner.u).toBeLessThanOrEqual(viewport.width - ISO_PADDING_PX + 0.01);
      expect(corner.v).toBeGreaterThanOrEqual(ISO_PADDING_PX - 0.01);
      expect(corner.v).toBeLessThanOrEqual(viewport.height - ISO_PADDING_PX + 0.01);
    }
  });

  it('draws only the two sides of a box that face the camera, in any winding', () => {
    const ring = squareRing({ x: 2, y: 2 }, 0, 0.5, 0.5);
    const box = isoPrism(basis, frame, { ring, base: 0, top: 1 });
    const flipped = isoPrism(basis, frame, { ring: [...ring].reverse(), base: 0, top: 1 });
    expect(box.sides).toHaveLength(2);
    expect(flipped.sides.map((side) => side.d).sort()).toEqual(
      box.sides.map((side) => side.d).sort(),
    );
    expect(new Set(box.sides.map((side) => side.shade)).size).toBe(2);
    expect(box.top).toMatch(/^M[\d.]+ [\d.]+(L[\d.]+ [\d.]+){3}Z$/u);
  });

  it('maps an object plane so local metres land where the projection puts them', () => {
    const matrix = isoPlaneMatrix(basis, frame, { at: { x: 3, y: 1 }, rotationDeg: 90, z: 0.8 });
    const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0] = (
      /matrix\(([^)]+)\)/u.exec(matrix)?.[1] ?? ''
    )
      .split(' ')
      .map(Number);
    const local = { x: 0.5, y: 0.2 };
    const expected = isoPixels(frame, isoProject(basis, { x: 3 - 0.2, y: 1 + 0.5 }, 0.8));
    expect(a * local.x + c * local.y + e).toBeCloseTo(expected.u, 2);
    expect(b * local.x + d * local.y + f).toBeCloseTo(expected.v, 2);
  });
});

describe('iso walls', () => {
  it('cuts the walls in front of the rooms to the cutaway height and keeps the far walls', () => {
    const pieces = isoWallPieces(basis, isoHouse(), 'cutaway');
    const topOf = (id: string): number | undefined =>
      pieces.find((piece) => piece.wall.id === id)?.prism.top;
    expect(topOf('south')).toBe(CUT_HEIGHT_METRES);
    expect(topOf('west')).toBe(CUT_HEIGHT_METRES);
    expect(topOf('north')).toBe(2.5);
    expect(topOf('east')).toBe(2.5);
  });

  it('keeps every wall at full height in the full style and opens a door gap', () => {
    const house = isoHouse();
    const door = {
      id: 'door',
      wallId: 'south',
      from: { x: 1, y: 0 },
      to: { x: 2, y: 0 },
      kind: 'door' as const,
      sourceKind: null,
      sillHeight: 0,
      headHeight: 2.1,
      hinge: 'left' as const,
      swing: 'in' as const,
      contactDeviceId: null,
      lockDeviceId: null,
      roomIds: [],
    };
    const pieces = isoWallPieces(basis, { ...house, openings: [door] }, 'full');
    expect(
      pieces.filter((piece) => piece.prism.base === 0).every((piece) => piece.prism.top === 2.5),
    ).toBe(true);
    const south = pieces.filter((piece) => piece.wall.id === 'south');
    expect(south.map((piece) => [piece.prism.base, piece.prism.top])).toEqual([
      [0, 2.5],
      [2.1, 2.5],
      [0, 2.5],
    ]);
  });
});

describe('iso helpers', () => {
  it('colours a floor with its material and falls back to the room colour', () => {
    const plain: RenderRoom = isoRoom('a', 0, 4);
    const wood: RenderRoom = {
      ...plain,
      floor: { status: 'material', kind: 'wood', variant: 'dark', tint: null },
    };
    const tinted: RenderRoom = {
      ...plain,
      floor: { status: 'material', kind: 'tile', variant: null, tint: '#336699' },
    };
    expect(isoFloorFill(plain, 'var(--room)', 'light')).toBe('var(--room)');
    expect(isoFloorFill(wood, 'var(--room)', 'light')).toBe('#6f4a2e');
    expect(isoFloorFill(tinted, 'var(--room)', 'light')).toBe('#336699');
    expect(isoFloorFill(tinted, 'var(--room)', 'dark')).not.toBe('#336699');
  });

  it('draws a pool as a closed ellipse and reads object heights', () => {
    expect(ellipsePath({ cx: 10, cy: 5, rx: 4, ry: 2 })).toBe(
      'M6.0 5.0a4.0 2.0 0 1 0 8.0 0a4.0 2.0 0 1 0 -8.0 0Z',
    );
    const [first] = isoHouse().objects;
    if (first === undefined) throw new Error('no object');
    expect(objectHeight(first)).toBe(0.8);
    expect(objectHeight({ ...first, height: null, params: { height: 1.9 } })).toBe(1.9);
    expect(objectHeight({ ...first, height: null, params: {} })).toBe(0.75);
  });
});
