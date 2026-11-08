import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { API_ENDPOINTS } from '../src/api/endpoints';
import { HOME_MAP_SCAN_ENDPOINTS } from '../src/api/endpoints-home-map-scan';
import { HOME_MAP, HOME_MAP_WRITE, type HomeMap } from '../src/home-map';
import { HOME_MAP_OP, HOME_MAP_REVISION_ENTRY, type HomeMapOp } from '../src/home-map-edit-ops';
import { applyHomeMapEdits, type HomeMapEditContext } from '../src/home-map-edits';
import {
  HOME_MAP_SCAN,
  HOME_MAP_SCAN_WRITE,
  applySimilarity2d,
  fitSimilarity2d,
  type HomeMapScan,
  type ScanPlanPair,
  type Similarity2d,
} from '../src/home-map-scan';
import { mcpOperationArea } from '../src/mcp/operations';

const USER: HomeMapEditContext = { actor: 'profile:alice', at: '2026-10-25T11:00:00.000Z' };
const HASH = 'a'.repeat(64);

const SCAN: HomeMapScan = {
  file: { hash: HASH, format: 'ply', bytes: 5_000_000_000, name: 'living.ply' },
  lod: null,
  transform: { tx: 1, ty: 2, tz: 0, yawDeg: 30, scale: 1, levelled: true },
  opacity: 0.8,
  points: [],
  residualM: null,
  uploadedAt: '2026-10-25T10:00:00.000Z',
  uploadedBy: 'profile:alice',
};

const mapWith = (scan?: HomeMapScan): HomeMap =>
  HOME_MAP.parse({
    id: 'home',
    schemaVersion: 1,
    revision: 3,
    name: 'House',
    north: 0,
    updatedAt: '2026-10-25T10:00:00.000Z',
    floors: [],
    sources: [],
    notices: [],
    ...(scan === undefined ? {} : { scan }),
  });

const TRUTH: Similarity2d = { tx: 3.25, ty: -1.5, yawDeg: 37, scale: 1.8 };
const SCAN_POINTS = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 3 },
  { x: 0, y: 3.5 },
  { x: 2, y: 1 },
];

const pairsFor = (truth: Similarity2d, count: number, noise = 0): readonly ScanPlanPair[] =>
  SCAN_POINTS.slice(0, count).map((scan, index) => {
    const placed = applySimilarity2d(truth, scan);
    const wobble = noise * (index % 2 === 0 ? 1 : -1);
    return { scan, map: { x: placed.x + wobble, y: placed.y - wobble } };
  });

const expectRecovered = (fit: Similarity2d | null, truth: Similarity2d, digits: number): void => {
  expect(fit).not.toBeNull();
  expect(fit?.tx).toBeCloseTo(truth.tx, digits);
  expect(fit?.ty).toBeCloseTo(truth.ty, digits);
  expect(fit?.yawDeg).toBeCloseTo(truth.yawDeg, digits);
  expect(fit?.scale).toBeCloseTo(truth.scale, digits);
};

describe('fitSimilarity2d', () => {
  it.each([2, 3, 4])('recovers a known transform exactly from %i points', (count) => {
    const fit = fitSimilarity2d(pairsFor(TRUTH, count));
    expectRecovered(fit, TRUTH, 9);
    expect(fit?.residualM).toBeCloseTo(0, 9);
  });

  it('recovers a mirrored-free turn across the whole circle and any scale', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -179, max: 179, noNaN: true }),
        fc.double({ min: 0.2, max: 6, noNaN: true }),
        fc.double({ min: -20, max: 20, noNaN: true }),
        fc.double({ min: -20, max: 20, noNaN: true }),
        (yawDeg, scale, tx, ty) => {
          const truth = { tx, ty, yawDeg, scale };
          expectRecovered(fitSimilarity2d(pairsFor(truth, 3)), truth, 6);
        },
      ),
      { numRuns: 20 },
    );
  });

  it('stays near the truth with noise and reports the residual as an RMS in metres', () => {
    const noise = 0.02;
    const fit = fitSimilarity2d(pairsFor(TRUTH, 5, noise));
    expectRecovered(fit, TRUTH, 1);
    const residual = fit?.residualM ?? Number.NaN;
    expect(residual).toBeGreaterThan(0);
    expect(residual).toBeLessThanOrEqual(noise * Math.SQRT2);
  });

  it('reports a residual equal to the RMS distance of the fitted points to the map points', () => {
    const pairs = pairsFor(TRUTH, 4, 0.05);
    const fit = fitSimilarity2d(pairs);
    if (fit === null) throw new Error('no fit');
    const squares = pairs.map((pair) => {
      const placed = applySimilarity2d(fit, pair.scan);
      return (placed.x - pair.map.x) ** 2 + (placed.y - pair.map.y) ** 2;
    });
    const rms = Math.sqrt(squares.reduce((sum, value) => sum + value, 0) / squares.length);
    expect(fit.residualM).toBeCloseTo(rms, 12);
  });

  it('gives no fit for fewer than two pairs or points that cannot define a turn', () => {
    const [first] = pairsFor(TRUTH, 1);
    expect(fitSimilarity2d([])).toBeNull();
    expect(fitSimilarity2d(first ? [first] : [])).toBeNull();
    const same = { scan: { x: 1, y: 1 }, map: { x: 0, y: 0 } };
    expect(fitSimilarity2d([same, { ...same, map: { x: 5, y: 5 } }])).toBeNull();
    const together = { scan: { x: 1, y: 1 }, map: { x: 2, y: 2 } };
    const apart = { scan: { x: 4, y: 1 }, map: { x: 2, y: 2 } };
    expect(fitSimilarity2d([together, apart])).toBeNull();
  });
});

describe('the scan on a home map', () => {
  it('is optional and kept by the reader and the writer, with no byte cap', () => {
    expect(mapWith().scan).toBeUndefined();
    const withScan = mapWith(SCAN);
    expect(withScan.scan?.file.bytes).toBe(5_000_000_000);
    expect(HOME_MAP_WRITE.safeParse(withScan).success).toBe(true);
    expect(HOME_MAP_SCAN_WRITE.safeParse({ ...SCAN, extra: 1 }).success).toBe(false);
    expect(HOME_MAP_SCAN.parse({ ...SCAN, extra: 1 })).toHaveProperty('extra', 1);
  });

  it('accepts the four formats and refuses an unknown one, a bad hash and a zero scale', () => {
    for (const format of ['ply', 'splat', 'spz', 'rad'] as const) {
      const file = { ...SCAN.file, format };
      expect(HOME_MAP_SCAN_WRITE.safeParse({ ...SCAN, file }).success).toBe(true);
    }
    const bad = [
      { ...SCAN, file: { ...SCAN.file, format: 'obj' } },
      { ...SCAN, file: { ...SCAN.file, hash: 'xyz' } },
      { ...SCAN, transform: { ...SCAN.transform, scale: 0 } },
      { ...SCAN, opacity: 1.5 },
    ];
    for (const scan of bad) expect(HOME_MAP_SCAN_WRITE.safeParse(scan).success).toBe(false);
  });
});

describe('the scan edit ops', () => {
  it('set the transform, opacity, points and residual, and undo restores exactly', () => {
    const before = mapWith(SCAN);
    const points = [{ scan: { x: 1, y: 2, z: 0 }, map: { x: 3, y: 4 } }];
    const ops: HomeMapOp[] = [
      { op: 'setScanTransform', patch: { transform: { tx: 9, yawDeg: 90 }, opacity: 0.4 } },
      { op: 'setScanTransform', patch: { points, residualM: 0.07 } },
    ];
    const done = applyHomeMapEdits(before, ops, USER);
    expect(done.conflicts).toStrictEqual([]);
    expect(done.map.revision).toBe(4);
    expect(done.map.scan?.transform).toStrictEqual({ ...SCAN.transform, tx: 9, yawDeg: 90 });
    expect(done.map.scan?.opacity).toBe(0.4);
    expect(done.map.scan?.points).toStrictEqual(points);
    expect(done.map.scan?.residualM).toBe(0.07);
    expect(done.map.scan?.file).toStrictEqual(SCAN.file);
    const undone = applyHomeMapEdits(done.map, done.inverse, USER);
    expect(undone.conflicts).toStrictEqual([]);
    expect(undone.map.scan).toStrictEqual(SCAN);
  });

  it('remove the scan and undo puts the very same scan back; redo removes it again', () => {
    const before = mapWith(SCAN);
    const removed = applyHomeMapEdits(before, [{ op: 'removeScan' }], USER);
    expect(removed.map.scan).toBeUndefined();
    expect('scan' in removed.map).toBe(false);
    const undone = applyHomeMapEdits(removed.map, removed.inverse, USER);
    expect(undone.map.scan).toStrictEqual(SCAN);
    const redone = applyHomeMapEdits(undone.map, undone.inverse, USER);
    expect(redone.map.scan).toBeUndefined();
  });

  it('set a scan where none exists (undo removes it) and replace one (undo restores it)', () => {
    const empty = mapWith();
    const added = applyHomeMapEdits(empty, [{ op: 'setScan', scan: SCAN }], USER);
    expect(added.map.scan).toStrictEqual(SCAN);
    expect(applyHomeMapEdits(added.map, added.inverse, USER).map.scan).toBeUndefined();
    const other = { ...SCAN, file: { ...SCAN.file, hash: 'b'.repeat(64), format: 'spz' } };
    const replaced = applyHomeMapEdits(added.map, [{ op: 'setScan', scan: other }], USER);
    expect(replaced.map.scan?.file.format).toBe('spz');
    expect(applyHomeMapEdits(replaced.map, replaced.inverse, USER).map.scan).toStrictEqual(SCAN);
  });

  it('report conflicts per op and never throw', () => {
    const none = applyHomeMapEdits(
      mapWith(),
      [{ op: 'removeScan' }, { op: 'setScanTransform', patch: { opacity: 0.5 } }],
      USER,
    );
    expect(
      none.conflicts.map((conflict) => [conflict.op, conflict.kind, conflict.reason]),
    ).toStrictEqual([
      ['removeScan', 'scan', 'missing_element'],
      ['setScanTransform', 'scan', 'missing_element'],
    ]);
    expect(none.map.revision).toBe(3);
    const invalid = applyHomeMapEdits(
      mapWith(SCAN),
      [
        { op: 'setScanTransform', patch: { transform: { scale: 0 } } },
        { op: 'setScanTransform', patch: { file: {} } },
        { op: 'setScanTransform', patch: {} },
        { op: 'setScan', scan: { nope: true } },
      ],
      USER,
    );
    expect(invalid.conflicts.map((conflict) => conflict.reason)).toStrictEqual([
      'invalid',
      'invalid',
      'invalid',
      'invalid',
    ]);
    expect(invalid.map.scan).toStrictEqual(SCAN);
  });

  it('travel in edit batches and revision entries as plain data', () => {
    const ops: HomeMapOp[] = [
      { op: 'setScan', scan: SCAN },
      { op: 'setScanTransform', patch: { opacity: 0.5 } },
      { op: 'removeScan' },
    ];
    for (const op of ops) expect(HOME_MAP_OP.parse(op)).toStrictEqual(op);
    const done = applyHomeMapEdits(mapWith(), ops, USER);
    const entry = {
      revision: done.map.revision,
      ops: done.applied,
      inverse: done.inverse,
      actor: USER.actor,
      at: USER.at,
    };
    expect(HOME_MAP_REVISION_ENTRY.parse(entry)).toStrictEqual(entry);
  });
});

describe('the scan endpoints', () => {
  it('are registered once at member access, one line each, in the home area', () => {
    const names = ['uploadHomeMapScan', 'homeMapScanLink', 'removeHomeMapScan'] as const;
    expect(Object.keys(HOME_MAP_SCAN_ENDPOINTS)).toStrictEqual([...names]);
    const routes = names.map((name) => {
      const entry = API_ENDPOINTS[name];
      expect(entry).toBe(HOME_MAP_SCAN_ENDPOINTS[name]);
      expect(entry.access).toBe(API_ENDPOINTS.createRoom.access);
      expect(entry.summary).not.toContain('\n');
      expect(mcpOperationArea(entry)).toBe('home');
      return `${entry.method} ${entry.path}`;
    });
    expect(routes).toStrictEqual([
      'PUT /api/home-maps/:mapId/scan',
      'GET /api/home-maps/:mapId/scan/link',
      'DELETE /api/home-maps/:mapId/scan',
    ]);
  });

  it('take a format and name for the upload, a content hash for the link, and no byte cap', () => {
    const query = HOME_MAP_SCAN_ENDPOINTS.uploadHomeMapScan.query;
    expect(query.safeParse({ format: 'splat', name: 'room.splat' }).success).toBe(true);
    expect(query.safeParse({ format: 'obj', name: 'room.obj' }).success).toBe(false);
    expect(query.safeParse({ format: 'ply', name: ' ' }).success).toBe(false);
    const link = HOME_MAP_SCAN_ENDPOINTS.homeMapScanLink.query;
    expect(link.safeParse({ hash: 'a'.repeat(64) }).success).toBe(true);
    expect(link.safeParse({ hash: 'nope' }).success).toBe(false);
    expect(link.safeParse({}).success).toBe(false);
  });
});
