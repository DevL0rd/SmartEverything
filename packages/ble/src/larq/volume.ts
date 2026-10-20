import type { BottleBody, BottleCalibrationPoint, BottleCurve } from '@smarteverything/domain';
import { z } from 'zod';
import { LarqCalibrationError } from './errors';
import { solveLinear } from './linear';

export type CurveId = 'larq_680' | 'larq_1000' | 'cup_680_nofilter' | 'custom';

export interface VolumeCurve extends BottleCurve {
  readonly id: CurveId;
  readonly capacityMl: number;
}

const LARQ_TOF_MAX_MM = 250;

const BRIM_ALLOWANCE = 1.06;

export const CURVES = {
  larq_1000: {
    id: 'larq_1000',
    capacityMl: 1000,
    coefficients: [-1.1e-6, 5.5211e-4, -0.08516349, -0.2839113, 1026.71212239],
    tofMaxMm: LARQ_TOF_MAX_MM,
    maxMl: 1000 * BRIM_ALLOWANCE,
  },
  larq_680: {
    id: 'larq_680',
    capacityMl: 680,
    coefficients: [-1.19e-6, 5.0264e-4, -0.06522747, -0.81937241, 715.15212206],
    tofMaxMm: LARQ_TOF_MAX_MM,
    maxMl: 680 * BRIM_ALLOWANCE,
  },
  cup_680_nofilter: {
    id: 'cup_680_nofilter',
    capacityMl: 680,
    coefficients: [0, -6.208893338e-5, 0.02199185096, -5.70134644, 791.0281811],
    tofMaxMm: 230,
    maxMl: 720,
  },
} as const satisfies Record<Exclude<CurveId, 'custom'>, VolumeCurve>;

const CALIBRATION_TOF_MARGIN_MM = 23;

const CALIBRATION_BRIM_ALLOWANCE = 1.02;

const DISTANCE_SCALE = 100;

const MIN_DISTINCT_DISTANCES = 5;

export function curveFor(body: BottleBody, custom: BottleCurve | null): VolumeCurve {
  if (custom !== null) {
    return { ...custom, id: 'custom', capacityMl: body };
  }
  return body === 1000 ? CURVES.larq_1000 : CURVES.larq_680;
}

export function volumeOf(curve: BottleCurve, distanceMm: number): number {
  const [c0, c1, c2, c3, c4] = curve.coefficients;
  const d = distanceMm;
  const raw = c0 * d ** 4 + c1 * d ** 3 + c2 * d ** 2 + c3 * d + c4;
  return Math.min(curve.maxMl, Math.max(0, raw));
}

export interface CalibrationFit {
  readonly curve: BottleCurve;
  readonly rmseMl: number;
}

function momentOf(points: readonly BottleCalibrationPoint[], power: number): number {
  return points.reduce((total, point) => total + (point.distanceMm / DISTANCE_SCALE) ** power, 0);
}

function weightedMomentOf(points: readonly BottleCalibrationPoint[], power: number): number {
  return points.reduce(
    (total, point) => total + point.ml * (point.distanceMm / DISTANCE_SCALE) ** power,
    0,
  );
}

const POWERS = [0, 1, 2, 3] as const;

const CUBIC_SOLUTION = z.tuple([z.number(), z.number(), z.number(), z.number()]);

function solveCubic(points: readonly BottleCalibrationPoint[]): number[] {
  try {
    return solveLinear(
      POWERS.map((row) => [
        ...POWERS.map((column) => momentOf(points, row + column)),
        weightedMomentOf(points, row),
      ]),
    );
  } catch (cause) {
    throw new LarqCalibrationError(
      'The calibration points do not pin down a curve; measure at more different levels.',
      { cause },
    );
  }
}

export function fitCalibration(points: readonly BottleCalibrationPoint[]): CalibrationFit {
  const distinct = new Set(points.map((point) => point.distanceMm));
  if (distinct.size < MIN_DISTINCT_DISTANCES) {
    throw new LarqCalibrationError(
      `A calibration needs ${String(MIN_DISTINCT_DISTANCES)} different distances; ${String(distinct.size)} were measured.`,
    );
  }
  const [a0, a1, a2, a3] = CUBIC_SOLUTION.parse(solveCubic(points));
  const curve: BottleCurve = {
    coefficients: [0, a3 / DISTANCE_SCALE ** 3, a2 / DISTANCE_SCALE ** 2, a1 / DISTANCE_SCALE, a0],
    tofMaxMm: Math.max(...points.map((point) => point.distanceMm)) + CALIBRATION_TOF_MARGIN_MM,
    maxMl: Math.max(...points.map((point) => point.ml)) * CALIBRATION_BRIM_ALLOWANCE,
  };
  const squared = points.reduce(
    (total, point) => total + (volumeOf(curve, point.distanceMm) - point.ml) ** 2,
    0,
  );
  return { curve, rmseMl: Math.sqrt(squared / points.length) };
}
