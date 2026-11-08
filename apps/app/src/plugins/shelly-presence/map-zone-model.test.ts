import { describe, expect, it } from 'vitest';
import {
  homeMapPointInPolygon,
  shellyAreaToHousePolygons,
  shellyHousePointInArea,
  shellySensorToHouse,
  type ShellyHousePose,
} from '@smarteverything/domain';
import { EDIT_OVERLAY } from '../../components/house-map/3d/map-3d-edit-protocol';
import type { ShellyArea } from '@smarteverything/shelly';
import type { RenderPolygon } from '../../components/house-map/render-scene';
import { areaCells, commitStroke, toolStroke } from './area-context';
import { MapZoneEditor, zoneNotice } from './map-zone-editor';
import {
  areaRings,
  cellRing,
  fitRoomArea,
  gridLines,
  gridRange,
  houseCell,
  houseEdge,
  resizeSegment,
  segmentCornerOf,
  segmentCorners,
  zoneFrame,
  zoneOverlay,
  type ZoneOverlayInput,
} from './map-zone-model';
import { ZoneEditor } from './zone-editor';

const square: RenderPolygon = {
  outer: [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 4 },
    { x: 0, y: 4 },
  ],
  holes: [],
};

const ell: RenderPolygon = {
  outer: [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 2 },
    { x: 2, y: 2 },
    { x: 2, y: 4 },
    { x: 0, y: 4 },
  ],
  holes: [],
};

const wallPose: ShellyHousePose = { at: { x: 0, y: 2 }, yawDeg: 0 };

function sameCellsAsRoom(pose: ShellyHousePose, room: RenderPolygon): void {
  const area = fitRoomArea(pose, [room]);
  for (let x = -24; x < 24; x += 1) {
    for (let y = 0; y < 24; y += 1) {
      const centre = shellySensorToHouse(pose, { x: (x + 0.5) * 0.5, y: (y + 0.5) * 0.5 });
      expect(shellyHousePointInArea(pose, area, centre)).toBe(homeMapPointInPolygon(room, centre));
    }
  }
}

describe('houseCell', () => {
  it('finds the sensor cell of a house point through the R1 transform', () => {
    const pose = { at: { x: 5, y: 5 }, yawDeg: 0 };
    expect(houseCell(pose, { x: 6, y: 4.75 })).toEqual({ x: 0, y: 2 });
    expect(houseCell(pose, { x: 6, y: 5.25 })).toEqual({ x: -1, y: 2 });
  });

  it('turns a stroke painted in house metres into a segment that covers both ends', () => {
    const pose = { at: { x: 1, y: 1 }, yawDeg: 37 };
    const from = { x: 2.2, y: 2.9 };
    const to = { x: 3.4, y: 2.1 };
    const strokes = toolStroke('paint', houseCell(pose, from), houseCell(pose, to), undefined);
    const area = commitStroke([], 'paint', strokes);
    expect(shellyHousePointInArea(pose, area, from)).toBe(true);
    expect(shellyHousePointInArea(pose, area, to)).toBe(true);
    const erased = commitStroke(area, 'erase', strokes);
    expect(areaCells(erased)).toBe(0);
  });
});

describe('fitRoomArea', () => {
  it('fills a square room seen from its wall with one segment of its cells', () => {
    const area = fitRoomArea(wallPose, [square]);
    expect(area).toEqual([[-4, 8, 4, 0]]);
    expect(areaCells(area)).toBe(64);
  });

  it('keeps exactly the cells whose centre is inside the room for turned sensors', () => {
    sameCellsAsRoom(wallPose, square);
    sameCellsAsRoom({ at: { x: 2, y: 0 }, yawDeg: 90 }, ell);
    sameCellsAsRoom({ at: { x: 0.3, y: 0.2 }, yawDeg: 45 }, square);
    sameCellsAsRoom({ at: { x: 4, y: 3.1 }, yawDeg: 200 }, ell);
  });

  it('merges equal rows into one segment and splits an L shaped room', () => {
    const area = fitRoomArea({ at: { x: 2, y: 0 }, yawDeg: 90 }, [ell]);
    expect(area.length).toBe(2);
    expect(areaCells(area)).toBe(48);
  });

  it('gives no cells for a room without points', () => {
    expect(fitRoomArea(wallPose, [])).toEqual([]);
  });
});

describe('gridRange and gridLines', () => {
  it('spans the sensor window for each mounting position', () => {
    const pose = { at: { x: 0, y: 0 }, yawDeg: 90 };
    expect(gridRange(pose, 'left', [], [])).toEqual({ minX: -16, maxX: 0, minY: 0, maxY: 20 });
    expect(gridRange(pose, 'center', [], [])).toEqual({ minX: -8, maxX: 8, minY: 0, maxY: 20 });
    expect(gridRange(pose, 'right', [], [])).toEqual({ minX: 0, maxX: 16, minY: 0, maxY: 20 });
  });

  it('grows to hold the zone and the whole map room', () => {
    const range = gridRange(wallPose, 'center', [[-20, 30, -18, 25]], [square.outer]);
    expect(range).toEqual({ minX: -20, maxX: 8, minY: 0, maxY: 30 });
    expect(gridLines(wallPose, range).length).toBe(29 + 31);
  });

  it('draws zone cells on the same rotated grid as the domain polygons', () => {
    const pose = { at: { x: 5, y: 5 }, yawDeg: 0 };
    expect(areaRings(pose, [[0, 0, 2, 4]])).toEqual(
      shellyAreaToHousePolygons(pose, [[0, 0, 2, 4]]).map((polygon) => polygon.outer),
    );
  });
});

describe('segment corners', () => {
  const pose = { at: { x: 5, y: 5 }, yawDeg: 0 };

  it('puts the four knobs of a segment on its cell edges, in the house frame', () => {
    const corners = segmentCorners(pose, [0, 4, 2, 0]);
    expect(corners).toHaveLength(4);
    corners.forEach((corner, index) => {
      const expected = [
        shellySensorToHouse(pose, { x: 0, y: 2 }),
        shellySensorToHouse(pose, { x: 1, y: 2 }),
        shellySensorToHouse(pose, { x: 1, y: 0 }),
        shellySensorToHouse(pose, { x: 0, y: 0 }),
      ][index];
      expect(corner.x).toBeCloseTo(expected?.x ?? Number.NaN, 9);
      expect(corner.y).toBeCloseTo(expected?.y ?? Number.NaN, 9);
    });
    expect(cellRing(pose, { x: 0, y: 0 })).toEqual(segmentCorners(pose, [0, 1, 1, 0]));
  });

  it('snaps a dragged knob to the nearest sensor cell edge', () => {
    const point = shellySensorToHouse(pose, { x: 1.2, y: 2.9 });
    expect(houseEdge(pose, point)).toEqual({ x: 2, y: 6 });
  });

  it('finds the segment and corner a knob belongs to', () => {
    const area: ShellyArea = [
      [0, 4, 2, 0],
      [4, 4, 6, 0],
    ];
    expect(segmentCornerOf(area, 'zone-segment:1:2')).toEqual({ segment: 1, corner: 2 });
    expect(segmentCornerOf(area, 'zone-segment:2:0')).toBeNull();
    expect(segmentCornerOf(area, 'room:1')).toBeNull();
  });
});

describe('resizeSegment', () => {
  const area: ShellyArea = [
    [0, 4, 2, 0],
    [4, 4, 6, 0],
  ];

  it('moves the dragged corner and keeps the opposite corner and the other segments', () => {
    expect(resizeSegment(area, { segment: 0, corner: 1 }, { x: 3, y: 6 }, undefined)).toEqual([
      [0, 6, 3, 0],
      [4, 4, 6, 0],
    ]);
    expect(resizeSegment(area, { segment: 1, corner: 3 }, { x: 5, y: 1 }, undefined)).toEqual([
      [0, 4, 2, 0],
      [5, 4, 6, 1],
    ]);
  });

  it('keeps the resized zone inside the main room', () => {
    expect(resizeSegment(area, { segment: 0, corner: 1 }, { x: 3, y: 6 }, [[0, 5, 4, 0]])).toEqual([
      [0, 5, 3, 0],
      [4, 4, 6, 0],
    ]);
    expect(resizeSegment(area, { segment: 0, corner: 1 }, { x: 3, y: 6 }, [[8, 9, 9, 8]])).toBe(
      null,
    );
  });

  it('refuses a corner that would leave no cells or a segment that is gone', () => {
    expect(resizeSegment(area, { segment: 0, corner: 1 }, { x: 0, y: 6 }, undefined)).toBeNull();
    expect(resizeSegment(area, { segment: 0, corner: 2 }, { x: 3, y: 4 }, undefined)).toBeNull();
    expect(resizeSegment(area, { segment: 3, corner: 0 }, { x: 3, y: 6 }, undefined)).toBeNull();
  });
});

describe('zoneOverlay', () => {
  const pose = { at: { x: 0, y: 2 }, yawDeg: 0 };
  const base: ZoneOverlayInput = {
    pose,
    area: [
      [0, 4, 2, 0],
      [4, 4, 6, 2],
    ],
    context: [[-4, 2, -2, 0]],
    allowed: [[-8, 16, 8, 0]],
    grid: { minX: -8, maxX: 8, minY: 0, maxY: 20 },
    pending: null,
    frame: zoneFrame('presence-zones:sensor', { minX: 0, minY: 0, maxX: 4, maxY: 4 }),
  };

  it('draws the zone in info blue with a knob on every corner of every segment', () => {
    const overlay = EDIT_OVERLAY.parse(zoneOverlay(base));
    expect(overlay.mode).toBe('draw-rect');
    expect(overlay.shapes.map((shape) => shape.id)).toEqual(['zone-segment:0', 'zone-segment:1']);
    expect(overlay.handles).toHaveLength(8);
    expect(overlay.handles[5]).toMatchObject({
      id: 'zone-segment:1:1',
      kind: 'point',
      surface: { kind: 'ground' },
      target: { kind: 'shape-corner', shapeId: 'zone-segment:1', index: 1 },
    });
    const zone = overlay.ghosts.filter(
      (ghost) => ghost.shape === 'polygon' && ghost.tone === 'info',
    );
    expect(zone).toHaveLength(areaRings(pose, base.area).length);
    expect(
      overlay.ghosts.filter((ghost) => ghost.shape === 'polyline' && ghost.tone === 'info'),
    ).toHaveLength(1);
    expect(overlay.frame).toEqual({
      key: 'presence-zones:sensor',
      bounds: { minX: 0, minY: 0, maxX: 4, maxY: 4 },
      top: true,
    });
  });

  it('marks the first tapped corner cell, red while erasing', () => {
    const erasing = zoneOverlay({ ...base, pending: { cell: { x: 1, y: 1 }, erase: true } });
    expect(erasing.ghosts.at(-1)).toEqual({
      shape: 'polygon',
      tone: 'danger',
      points: cellRing(pose, { x: 1, y: 1 }).map((point) => ({ ...point, height: 0 })),
    });
    const painting = zoneOverlay({ ...base, pending: { cell: { x: 1, y: 1 }, erase: false } });
    expect(painting.ghosts.at(-1)).toMatchObject({ shape: 'polygon', tone: 'info' });
  });

  it('asks for no frame around an empty extent', () => {
    expect(zoneFrame('k', { minX: 1, minY: 1, maxX: 1, maxY: 3 })).toBeNull();
  });
});

describe('zoneNotice', () => {
  it('tells what the next tap on the 3D map does', () => {
    expect(zoneNotice('paint', null)).toEqual({
      text: 'Tap a corner of the cells to paint',
      tone: 'info',
    });
    expect(zoneNotice('erase', null).text).toBe('Tap a corner of the cells to erase');
    expect(zoneNotice('erase', { x: 1, y: 2 }).text).toBe('Tap the opposite corner');
  });
});

describe('zone editor modules', () => {
  it('load for the live app', () => {
    expect(typeof ZoneEditor).toBe('function');
    expect(typeof MapZoneEditor).toBe('function');
  });
});
