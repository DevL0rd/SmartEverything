import { describe, expect, it } from 'vitest';
import { sourceToHouse } from '../../../../../components/house-map/overlays/model';
import {
  houseToSource,
  houseZoneView,
  nudgeStep,
  robotZoneView,
  type ZoneView,
} from './zone-frame';
import { hitShape, shapePoints } from './zone-geometry';
import { initialZoneState, zoneReducer, type ZoneState } from './zone-reducer';
import { restrictedOf } from './zone-shapes';

const robotBounds = { minX: 0, minY: 0, maxX: 10, maxY: 8 };

const turned = { rotationDeg: 90, tx: 10, ty: 0.5, mirrored: false };

const houseBounds = { minX: 2, minY: 0.5, maxX: 10, maxY: 10.5 };

const zones = [
  {
    id: 1,
    kind: 'no_go' as const,
    points: [
      { x: 1, y: 1 },
      { x: 3, y: 1 },
      { x: 3, y: 2 },
      { x: 1, y: 2 },
    ],
  },
];

const transforms = [
  { rotationDeg: 0, tx: 0, ty: 0, mirrored: false },
  turned,
  { rotationDeg: 37.5, tx: -2.25, ty: 4, mirrored: false },
  { rotationDeg: 0, tx: 9, ty: 0.5, mirrored: true },
  { rotationDeg: -120, tx: 1.5, ty: -3, mirrored: true },
];

const points = [
  { x: 0, y: 0 },
  { x: 2.5, y: -1.25 },
  { x: -6.8, y: 8.45 },
];

function dragOnHouse(view: ZoneView, by: { readonly x: number; readonly y: number }): ZoneState {
  const state = initialZoneState(zones, '1:current');
  const centre = view.toView({ x: 2, y: 1.5 });
  const start = view.toRobot(centre);
  const hit = hitShape(state.present, null, start, 0.25);
  if (hit === null) throw new Error('the zone was not hit');
  const end = view.toRobot({ x: centre.x + by.x, y: centre.y + by.y });
  return [
    { type: 'grab', key: hit.key, handle: hit.handle, start } as const,
    { type: 'drag', point: end, bounds: robotBounds } as const,
    { type: 'release' } as const,
  ].reduce(zoneReducer, state);
}

describe('the zone frame between the robot and the house', () => {
  it('turns a house point back into the same robot point', () => {
    for (const transform of transforms) {
      for (const point of points) {
        const back = houseToSource(transform, sourceToHouse(transform, point));
        expect(back.x).toBeCloseTo(point.x, 9);
        expect(back.y).toBeCloseTo(point.y, 9);
      }
    }
  });

  it('keeps the robot view as the identity', () => {
    const view = robotZoneView(robotBounds);
    expect(view.toView({ x: 1, y: 2 })).toEqual({ x: 1, y: 2 });
    expect(view.toRobot({ x: 1, y: 2 })).toEqual({ x: 1, y: 2 });
  });

  it('draws a robot zone where the house transform puts it', () => {
    const view = houseZoneView(houseBounds, turned);
    const [shape] = initialZoneState(zones, '1:current').present;
    if (shape === undefined) throw new Error('no shape');
    const drawn = shapePoints(shape).map(view.toView);
    const expected = [
      { x: 9, y: 1.5 },
      { x: 9, y: 3.5 },
      { x: 8, y: 3.5 },
      { x: 8, y: 1.5 },
    ];
    drawn.forEach((point, index) => {
      expect(point.x).toBeCloseTo(expected[index]?.x ?? Number.NaN, 6);
      expect(point.y).toBeCloseTo(expected[index]?.y ?? Number.NaN, 6);
    });
  });

  it('sends a zone dragged on the turned house map in robot coordinates', () => {
    const view = houseZoneView(houseBounds, turned);
    const moved = dragOnHouse(view, { x: 1, y: 0 });
    const [area] = restrictedOf(moved.present).noGo;
    const expected = [
      { x: 1, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 1 },
      { x: 1, y: 1 },
    ];
    area?.forEach((point, index) => {
      expect(point.x).toBeCloseTo(expected[index]?.x ?? Number.NaN, 6);
      expect(point.y).toBeCloseTo(expected[index]?.y ?? Number.NaN, 6);
    });
  });

  it('sends unchanged robot areas when nothing was edited on the house map', () => {
    const state = initialZoneState(zones, '1:current');
    expect(restrictedOf(state.present).noGo).toEqual([zones[0]?.points]);
  });

  it('nudges along the screen arrows in the robot frame', () => {
    const view = houseZoneView(houseBounds, turned);
    const right = nudgeStep(view, 'right');
    expect(right.x).toBeCloseTo(0, 9);
    expect(right.y).toBeCloseTo(-0.1, 9);
    const mirrored = houseZoneView(houseBounds, { rotationDeg: 0, tx: 9, ty: 0, mirrored: true });
    expect(nudgeStep(mirrored, 'right').x).toBeCloseTo(-0.1, 9);
    expect(nudgeStep(robotZoneView(robotBounds), 'up')).toEqual({ x: 0, y: 0.1 });
  });
});
