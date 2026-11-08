import { describe, expect, it } from 'vitest';
import {
  EDIT_OVERLAY,
  type EditEvent,
} from '../../../../../components/house-map/3d/map-3d-edit-protocol';
import { houseZoneView, robotZoneView } from './zone-frame';
import { initialZoneState, zoneReducer, type ZoneState } from './zone-reducer';
import { zoneActionsOf, zoneNotice, zoneSceneOverlay } from './zone-scene';
import type { Draft, RectShape, WallShape } from './zone-shapes';

const bounds = { minX: 0, minY: 0, maxX: 10, maxY: 8 };

const clean: RectShape = {
  form: 'rect',
  key: 1,
  kind: 'clean',
  rect: { x1: 1, y1: 1, x2: 3, y2: 2 },
};

const noGo: RectShape = {
  form: 'rect',
  key: 2,
  kind: 'no_go',
  rect: { x1: 5, y1: 5, x2: 6, y2: 6 },
};

const wall: WallShape = {
  form: 'wall',
  key: 3,
  kind: 'wall',
  from: { x: 7, y: 1 },
  to: { x: 9, y: 1 },
};

const draft: Draft = [clean, noGo, wall];

const robot = robotZoneView(bounds);

const turned = houseZoneView(bounds, { rotationDeg: 90, tx: 10, ty: 0, mirrored: false });

function tap(x: number, y: number): EditEvent {
  return {
    seq: 1,
    type: 'tap',
    point: { x, y },
    floorId: 'f1',
    hit: { kind: 'none' },
    metresPerPx: 0.01,
  };
}

function vertex(handleId: string, x: number, y: number): EditEvent {
  return { seq: 2, type: 'vertex', handleId, point: { x, y } };
}

function stateOf(selected: number | null): ZoneState {
  return { ...initialZoneState([], 'v1'), present: draft, selected };
}

describe('the zone overlay in the 3D scene', () => {
  it('draws every zone as a valid overlay framed in Top, with handles only on the selected one', () => {
    const overlay = zoneSceneOverlay({ draft, selected: null, view: robot, frameKey: 'zones:r' });
    expect(EDIT_OVERLAY.safeParse(overlay).success).toBe(true);
    expect(overlay.frame).toEqual({ key: 'zones:r', bounds, top: true });
    expect(overlay.shapes.map((shape) => shape.kind)).toEqual(['ring', 'ring', 'line']);
    expect(overlay.handles).toEqual([]);
    expect(overlay.ghosts.map((ghost) => ghost.tone)).toEqual([
      'accent',
      'accent',
      'danger',
      'danger',
      'danger',
    ]);
    expect(overlay.labels.map((label) => label.text)).toEqual(['Zone 1']);
  });

  it('puts each corner knob on the matching corner of its ring', () => {
    const overlay = zoneSceneOverlay({ draft, selected: 1, view: robot, frameKey: 'k' });
    const [ring] = overlay.shapes;
    if (ring?.kind !== 'ring') throw new Error('no ring');
    for (const handle of overlay.handles) {
      if (handle.target.kind !== 'shape-corner') throw new Error('not a corner');
      const corner = ring.points[handle.target.index];
      expect({ x: handle.at.x, y: handle.at.y }).toEqual(corner);
    }
    expect(overlay.handles).toHaveLength(4);
  });

  it('gives a virtual wall two end knobs and places zones where the house transform puts them', () => {
    const overlay = zoneSceneOverlay({ draft, selected: 3, view: turned, frameKey: 'k' });
    expect(overlay.handles.map((handle) => handle.target)).toEqual([
      { kind: 'line-end', lineId: 'zone:3', end: 'from' },
      { kind: 'line-end', lineId: 'zone:3', end: 'to' },
    ]);
    const line = overlay.shapes[2];
    expect(line?.kind === 'line' ? line.from : null).toEqual(turned.toView(wall.from));
  });
});

describe('scene events on the zones', () => {
  it('selects the zone under a tap and clears the selection on empty floor', () => {
    const input = { draft, selected: null, view: robot, bounds };
    expect(zoneActionsOf(input, tap(2, 1.5))).toEqual([{ type: 'select', key: 1 }]);
    expect(zoneActionsOf(input, tap(9, 7))).toEqual([{ type: 'select', key: null }]);
  });

  it('resizes the selected zone from a dragged corner knob as one undo step', () => {
    const state = stateOf(1);
    const overlay = zoneSceneOverlay({ draft, selected: 1, view: turned, frameKey: 'k' });
    const corner = turned.toView({ x: 3, y: 2 });
    const knob = overlay.handles.find(
      (handle) => handle.at.x === corner.x && handle.at.y === corner.y,
    );
    if (knob === undefined) throw new Error('no knob');
    const dropped = turned.toView({ x: 4, y: 3 });
    const input = { draft, selected: 1, view: turned, bounds };
    const next = zoneActionsOf(input, vertex(knob.id, dropped.x, dropped.y)).reduce(
      zoneReducer,
      state,
    );
    const shape = next.present.find((item) => item.key === 1);
    expect(shape?.form === 'rect' ? shape.rect.x2 : null).toBeCloseTo(4, 9);
    expect(shape?.form === 'rect' ? shape.rect.y2 : null).toBeCloseTo(3, 9);
    expect(next.past).toHaveLength(1);
  });

  it('moves a wall end and ignores knobs of a shape that is not selected', () => {
    const state = stateOf(3);
    const input = { draft, selected: 3, view: robot, bounds };
    const next = zoneActionsOf(input, vertex('zone:3:to', 9, 3)).reduce(zoneReducer, state);
    const moved = next.present.find((item) => item.key === 3);
    expect(moved?.form === 'wall' ? moved.to : null).toEqual({ x: 9, y: 3 });
    expect(zoneActionsOf(input, vertex('zone:1:ne', 4, 4))).toEqual([]);
  });

  it('names what to do next in the stage notice', () => {
    expect(zoneNotice(draft, null).text).toBe('Tap a zone or a wall to select it');
    expect(zoneNotice(draft, 3).text).toBe('Drag an end knob to change the wall');
    expect(zoneNotice(draft, 1).text).toMatch(/corner knob/u);
  });
});
