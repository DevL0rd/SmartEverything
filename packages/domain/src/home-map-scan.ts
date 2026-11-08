import { z } from 'zod';
import { MOMENT } from './api/primitives';

export const HOME_MAP_SCAN_FORMATS = ['ply', 'splat', 'spz', 'rad'] as const;

export type HomeMapScanFormat = (typeof HOME_MAP_SCAN_FORMATS)[number];

export const HOME_MAP_SCAN_HASH = z.string().regex(/^[0-9a-f]{64}$/);

const BYTES = z.number().int().nonnegative();

const FILE_SHAPE = {
  hash: HOME_MAP_SCAN_HASH,
  format: z.enum(HOME_MAP_SCAN_FORMATS),
  bytes: BYTES,
  name: z.string(),
};

const LOD_SHAPE = { hash: HOME_MAP_SCAN_HASH, bytes: BYTES };

const TRANSFORM_SHAPE = {
  tx: z.number(),
  ty: z.number(),
  tz: z.number(),
  yawDeg: z.number(),
  scale: z.number().positive(),
  levelled: z.boolean(),
};

const SCAN_POINT_SHAPE = {
  scan: z.strictObject({ x: z.number(), y: z.number(), z: z.number() }),
  map: z.strictObject({ x: z.number(), y: z.number() }),
};

const OPACITY = z.number().min(0).max(1);

const RESIDUAL = z.number().nonnegative().nullable();

export const HOME_MAP_SCAN_FILE_WRITE = z.strictObject(FILE_SHAPE);

export const HOME_MAP_SCAN_LOD_WRITE = z.strictObject(LOD_SHAPE);

export const HOME_MAP_SCAN_TRANSFORM_WRITE = z.strictObject(TRANSFORM_SHAPE);

export const HOME_MAP_SCAN_POINT_WRITE = z.strictObject(SCAN_POINT_SHAPE);

const SCAN_SHAPE = {
  opacity: OPACITY,
  residualM: RESIDUAL,
  uploadedAt: MOMENT,
  uploadedBy: z.string().min(1),
};

export const HOME_MAP_SCAN_WRITE = z.strictObject({
  ...SCAN_SHAPE,
  file: HOME_MAP_SCAN_FILE_WRITE,
  lod: HOME_MAP_SCAN_LOD_WRITE.nullable(),
  transform: HOME_MAP_SCAN_TRANSFORM_WRITE,
  points: z.array(HOME_MAP_SCAN_POINT_WRITE),
});

export type HomeMapScan = z.infer<typeof HOME_MAP_SCAN_WRITE>;

export type HomeMapScanTransform = z.infer<typeof HOME_MAP_SCAN_TRANSFORM_WRITE>;

export type HomeMapScanPoint = z.infer<typeof HOME_MAP_SCAN_POINT_WRITE>;

export const HOME_MAP_SCAN: z.ZodType<HomeMapScan> = z.looseObject({
  ...SCAN_SHAPE,
  file: z.looseObject(FILE_SHAPE),
  lod: z.looseObject(LOD_SHAPE).nullable(),
  transform: z.looseObject(TRANSFORM_SHAPE),
  points: z.array(
    z.looseObject({
      scan: z.looseObject(SCAN_POINT_SHAPE.scan.shape),
      map: z.looseObject(SCAN_POINT_SHAPE.map.shape),
    }),
  ),
});

export const HOME_MAP_SCAN_PATCH = z
  .strictObject({
    transform: HOME_MAP_SCAN_TRANSFORM_WRITE.partial().optional(),
    opacity: OPACITY.optional(),
    points: z.array(HOME_MAP_SCAN_POINT_WRITE).optional(),
    residualM: RESIDUAL.optional(),
  })
  .refine(
    (patch) => Object.keys(patch).length > 0,
    'give a transform, opacity, points or residualM',
  );

export interface ScanPlanPoint {
  readonly x: number;
  readonly y: number;
}

export interface ScanPlanPair {
  readonly scan: ScanPlanPoint;
  readonly map: ScanPlanPoint;
}

export interface Similarity2d {
  readonly tx: number;
  readonly ty: number;
  readonly yawDeg: number;
  readonly scale: number;
}

export interface SimilarityFit extends Similarity2d {
  readonly residualM: number;
}

const RADIANS = Math.PI / 180;

export function applySimilarity2d(transform: Similarity2d, point: ScanPlanPoint): ScanPlanPoint {
  const turn = transform.yawDeg * RADIANS;
  const cos = transform.scale * Math.cos(turn);
  const sin = transform.scale * Math.sin(turn);
  return {
    x: cos * point.x - sin * point.y + transform.tx,
    y: sin * point.x + cos * point.y + transform.ty,
  };
}

const mean = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

export function fitSimilarity2d(pairs: readonly ScanPlanPair[]): SimilarityFit | null {
  if (pairs.length < 2) return null;
  const scanX = mean(pairs.map((pair) => pair.scan.x));
  const scanY = mean(pairs.map((pair) => pair.scan.y));
  const mapX = mean(pairs.map((pair) => pair.map.x));
  const mapY = mean(pairs.map((pair) => pair.map.y));
  let dot = 0;
  let cross = 0;
  let energy = 0;
  for (const pair of pairs) {
    const sx = pair.scan.x - scanX;
    const sy = pair.scan.y - scanY;
    const mx = pair.map.x - mapX;
    const my = pair.map.y - mapY;
    dot += sx * mx + sy * my;
    cross += sx * my - sy * mx;
    energy += sx * sx + sy * sy;
  }
  const scale = Math.hypot(dot, cross) / energy;
  if (!(energy > 0) || !(scale > 0) || !Number.isFinite(scale)) return null;
  const yawDeg = Math.atan2(cross, dot) / RADIANS;
  const turn = yawDeg * RADIANS;
  const cos = scale * Math.cos(turn);
  const sin = scale * Math.sin(turn);
  const fit = {
    tx: mapX - (cos * scanX - sin * scanY),
    ty: mapY - (sin * scanX + cos * scanY),
    yawDeg,
    scale,
  };
  const squares = pairs.map((pair) => {
    const placed = applySimilarity2d(fit, pair.scan);
    return (placed.x - pair.map.x) ** 2 + (placed.y - pair.map.y) ** 2;
  });
  return { ...fit, residualM: Math.sqrt(mean(squares)) };
}
