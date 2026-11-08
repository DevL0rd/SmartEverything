import { describe, expect, it } from 'vitest';
import {
  HOME_MAP_SCAN_PATCH,
  HOME_MAP_SCAN_TRANSFORM_WRITE,
  applySimilarity2d,
  type HomeMapScanTransform,
} from '@smarteverything/domain';
import { EDIT_OVERLAY } from '../../../../components/house-map/3d/map-3d-edit-protocol';
import {
  EMPTY_POINTS,
  SCAN_GRIP_IDS,
  fieldPatch,
  fitOp,
  opacityOp,
  pairGhosts,
  placedPatch,
  pointsPrompt,
  pointsTap,
  residualText,
  scanCorners,
  scanExtentOf,
  scanMarks,
  scanOverlay,
  scanPointOf,
  transformOp,
  transformPatch,
} from './scan-align-model';

const IDENTITY: HomeMapScanTransform = {
  tx: 0,
  ty: 0,
  tz: 0,
  yawDeg: 0,
  scale: 1,
  levelled: true,
};

const EXTENT = { minX: 0, minY: 0, maxX: 4, maxY: 2 };

const near = (value: number, expected: number): void => {
  expect(value).toBeCloseTo(expected, 6);
};

const OVERLAY = { transform: IDENTITY, extent: EXTENT, readOnly: false, picking: false, marks: [] };

describe('scan extent', () => {
  it('uses the measured scan extent and falls back to the floor before it is known', () => {
    const floor = { minX: -1, minY: -1, maxX: 1, maxY: 1 };
    expect(scanExtentOf(EXTENT, floor)).toBe(EXTENT);
    expect(scanExtentOf(null, floor)).toBe(floor);
    expect(scanExtentOf(null, null)).toBeNull();
  });

  it('has no extent for a floor without any area, which the scene would refuse', () => {
    expect(scanExtentOf(null, { minX: 1, minY: 0, maxX: 1, maxY: 3 })).toBeNull();
  });

  it('places the extent corners by the stored move, turn and scale', () => {
    const corners = scanCorners({ ...IDENTITY, tx: 1, ty: -1, scale: 2, yawDeg: 90 }, EXTENT);
    near(corners[1]?.x ?? Number.NaN, 1);
    near(corners[1]?.y ?? Number.NaN, 7);
    near(corners[2]?.x ?? Number.NaN, -3);
    near(corners[2]?.y ?? Number.NaN, 7);
  });
});

describe('scan gizmo overlay', () => {
  it('sends a valid overlay with the outline, the extent for wall snapping and the pivot', () => {
    const overlay = EDIT_OVERLAY.parse(scanOverlay(OVERLAY));
    expect(overlay.mode).toBe('none');
    expect(overlay.scanExtent).toEqual(EXTENT);
    expect(overlay.gizmo?.centre).toEqual({ x: 2, y: 1, height: 0 });
    expect(overlay.ghosts[0]).toMatchObject({ shape: 'polyline', tone: 'accent' });
    expect(overlay.ghosts[0]?.shape === 'polyline' ? overlay.ghosts[0].points : []).toHaveLength(5);
  });

  it('has Move, the up arrow for Lift, the Turn ring and uniform Scale only, all on the scan', () => {
    const handles = scanOverlay(OVERLAY).handles;
    expect(handles.map((handle) => [handle.id, handle.kind])).toEqual([
      [SCAN_GRIP_IDS.move, 'plane'],
      [SCAN_GRIP_IDS.lift, 'top'],
      [SCAN_GRIP_IDS.turn, 'ring'],
      [SCAN_GRIP_IDS.scale, 'uniform'],
    ]);
    expect(handles.every((handle) => handle.target.kind === 'scan')).toBe(true);
    expect(handles.map((handle) => handle.at)).toEqual([
      { x: 2, y: 1, height: 0 },
      { x: 0, y: 1, height: 0 },
      { x: 2, y: 2, height: 0 },
      { x: 4, y: 2, height: 0 },
    ]);
  });

  it('hides the grips while picking points and keeps read-only on the wire', () => {
    expect(scanOverlay({ ...OVERLAY, picking: true }).handles).toEqual([]);
    expect(scanOverlay({ ...OVERLAY, readOnly: true }).readOnly).toBe(true);
  });

  it('draws no outline or grips before the scan has any extent', () => {
    const overlay = EDIT_OVERLAY.parse(scanOverlay({ ...OVERLAY, extent: null }));
    expect(overlay.handles).toEqual([]);
    expect(overlay.ghosts).toEqual([]);
    expect(overlay.scanExtent).toBeNull();
  });

  it('marks a pair with a filled dot, a ring and a link between them', () => {
    const ghosts = pairGhosts(
      [
        { from: { x: 0, y: 0 }, to: { x: 3, y: 0 } },
        { from: { x: 1, y: 1 }, to: null },
      ],
      'info',
    );
    expect(ghosts.map((ghost) => [ghost.shape, ghost.tone])).toEqual([
      ['polyline', 'neutral'],
      ['polygon', 'info'],
      ['polyline', 'accent'],
      ['polygon', 'info'],
    ]);
  });
});

describe('a gizmo drag sent back by the scene', () => {
  it('becomes only the changed transform fields with the turn kept in one revolution', () => {
    const placement = { tx: 1, ty: 0, tz: 0.2, yawDeg: -30, scale: 1 };
    expect(placedPatch(IDENTITY, placement)).toEqual({ tx: 1, tz: 0.2, yawDeg: 330 });
    expect(placedPatch(IDENTITY, { tx: 0, ty: 0, tz: 0, yawDeg: 0, scale: 1 })).toBeNull();
  });
});

describe('edits sent to the map', () => {
  it('sends only the changed transform fields as one setScanTransform', () => {
    const after = { ...IDENTITY, tx: 2, yawDeg: 30 };
    const patch = transformPatch(IDENTITY, after);
    expect(patch).toEqual({ tx: 2, yawDeg: 30 });
    expect(transformPatch(IDENTITY, { ...IDENTITY })).toBeNull();
    expect(transformOp({ tx: 2 })).toEqual({
      op: 'setScanTransform',
      patch: { transform: { tx: 2 } },
    });
  });

  it('checks typed numbers before they become edits', () => {
    expect(fieldPatch('scale', 0)).toBeNull();
    expect(fieldPatch('scale', 1.5)).toEqual({ scale: 1.5 });
    expect(fieldPatch('yawDeg', 370)).toEqual({ yawDeg: 10 });
    expect(fieldPatch('yawDeg', -90)).toEqual({ yawDeg: 270 });
    expect(fieldPatch('tz', Number.NaN)).toBeNull();
    expect(fieldPatch('tx', -3.2)).toEqual({ tx: -3.2 });
  });

  it('keeps opacity between 0 and 1', () => {
    expect(opacityOp(1.4)).toEqual({ op: 'setScanTransform', patch: { opacity: 1 } });
    expect(opacityOp(0.8)).toEqual({ op: 'setScanTransform', patch: { opacity: 0.8 } });
  });
});

describe('line up with two points', () => {
  const truth: HomeMapScanTransform = { ...IDENTITY, tx: 3, ty: -2, yawDeg: 30, scale: 1.25 };
  const scanA = { x: 1, y: 1 };
  const scanB = { x: 4, y: -2 };

  it('asks for the scan point, then the same point on the map, two pairs or more', () => {
    let draft = EMPTY_POINTS;
    expect(pointsPrompt(draft)).toBe('Tap point 1 on the scan');
    draft = pointsTap(draft, IDENTITY, scanA);
    expect(pointsPrompt(draft)).toBe('Now tap the same point 1 on the map');
    expect(fitOp(draft, true)).toBeNull();
    draft = pointsTap(draft, IDENTITY, applySimilarity2d(truth, scanA));
    draft = pointsTap(pointsTap(draft, IDENTITY, scanB), IDENTITY, applySimilarity2d(truth, scanB));
    expect(draft.pairs).toHaveLength(2);
    expect(pointsPrompt(draft)).toContain('Line up now');
  });

  it('recovers the move, turn and scale and stores the points and residual', () => {
    const pairs = [scanA, scanB, { x: -2, y: 3 }].map((scan) => ({
      scan,
      map: applySimilarity2d(truth, scan),
    }));
    const op = fitOp({ pairs, pending: null }, true);
    if (op?.op !== 'setScanTransform') throw new Error('no fit');
    const patch = HOME_MAP_SCAN_PATCH.parse(op.patch);
    const transform = HOME_MAP_SCAN_TRANSFORM_WRITE.partial().parse(patch.transform);
    near(transform.tx ?? Number.NaN, 3);
    near(transform.ty ?? Number.NaN, -2);
    near(transform.yawDeg ?? Number.NaN, 30);
    near(transform.scale ?? Number.NaN, 1.25);
    expect(transform.tz).toBeUndefined();
    expect(transform.levelled).toBe(true);
    expect(patch.points).toHaveLength(3);
    near(patch.residualM ?? 1, 0);
  });

  it('reads the tapped scan point through the current placement', () => {
    const map = applySimilarity2d(truth, scanB);
    const back = scanPointOf(truth, map);
    near(back.x, scanB.x);
    near(back.y, scanB.y);
  });

  it('says how close the fit is', () => {
    expect(residualText(null)).toBeNull();
    expect(residualText(0.001)).toBe('Lined up exactly');
    expect(residualText(0.04)).toBe('Lined up within 4 cm');
  });

  it('shows the stored points until new ones are tapped', () => {
    const stored = { points: [{ scan: { x: 1, y: 0, z: 0 }, map: { x: 5, y: 5 } }] };
    expect(scanMarks(stored, EMPTY_POINTS, { ...IDENTITY, tx: 1 })).toEqual([
      { from: { x: 2, y: 0 }, to: { x: 5, y: 5 } },
    ]);
    const tapped = pointsTap(EMPTY_POINTS, IDENTITY, { x: 3, y: 3 });
    expect(scanMarks(stored, tapped, IDENTITY)).toEqual([{ from: { x: 3, y: 3 }, to: null }]);
  });
});
