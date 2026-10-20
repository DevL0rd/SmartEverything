import { describe, expect, it } from 'vitest';
import type { BottleCalibrationPoint } from '@smarteverything/domain';
import { CURVES, LarqCalibrationError, curveFor, fitCalibration, volumeOf } from '../../src';

const CUP_REFERENCE: readonly (readonly [number, number])[] = [
  [207, 0],
  [183, 100],
  [161, 200],
  [121, 300],
  [93.5, 400],
  [68, 500],
  [37, 600],
  [16, 717],
];

describe('LARQ volume from distance', () => {
  it('reproduces the measuring cup reference points of a 680 ml bottle within 20 ml', () => {
    for (const [distance, expected] of CUP_REFERENCE) {
      expect(Math.abs(volumeOf(CURVES.cup_680_nofilter, distance) - expected)).toBeLessThan(20);
    }
  });

  it('reads an empty 680 ml bottle on the LARQ curve as about 24 ml, which is why it can be calibrated', () => {
    expect(volumeOf(CURVES.larq_680, 207)).toBeCloseTo(24, 0);
  });

  it('reads a nearly full 1 litre bottle at 37 mm', () => {
    expect(volumeOf(CURVES.larq_1000, 37)).toBeCloseTo(925.5, 0);
  });

  it('never goes below empty or above the brim of the bottle', () => {
    expect(volumeOf(CURVES.larq_680, 500)).toBe(0);
    expect(volumeOf(CURVES.larq_680, 0)).toBeCloseTo(715.15, 1);
    expect(volumeOf(CURVES.cup_680_nofilter, 1)).toBe(720);
  });

  it('picks the curve by body and prefers a calibration', () => {
    expect(curveFor(680, null).id).toBe('larq_680');
    expect(curveFor(1000, null).id).toBe('larq_1000');
    const custom = curveFor(680, CURVES.cup_680_nofilter);
    expect(custom.id).toBe('custom');
    expect(custom.capacityMl).toBe(680);
    expect(custom.coefficients).toStrictEqual(CURVES.cup_680_nofilter.coefficients);
  });
});

function exact(distanceMm: number): BottleCalibrationPoint {
  return { distanceMm, ml: volumeOf(CURVES.cup_680_nofilter, distanceMm) };
}

describe('LARQ calibration fit', () => {
  it('recovers a cubic from its own points, so a calibration reproduces the cup', () => {
    const points = [16, 37, 68, 93.5, 121, 161, 183, 207].map(exact);
    const fit = fitCalibration(points);
    expect(fit.rmseMl).toBeLessThan(0.5);
    for (const [index, expected] of CURVES.cup_680_nofilter.coefficients.entries()) {
      expect(fit.curve.coefficients[index]).toBeCloseTo(expected, 5);
    }
    expect(fit.curve.tofMaxMm).toBe(230);
    expect(fit.curve.maxMl).toBeGreaterThan(700);
  });

  it('fits points that need a row swap while solving', () => {
    const points = [200, 230, 260, 300, 340, 400].map((distanceMm) => ({
      distanceMm,
      ml: 1200 - 3 * distanceMm + 0.002 * distanceMm ** 2,
    }));
    const fit = fitCalibration(points);
    expect(fit.rmseMl).toBeLessThan(0.01);
  });

  it('reports how far the fit is from noisy points', () => {
    const noisy = CUP_REFERENCE.map(([distanceMm, ml], index) => ({
      distanceMm,
      ml: ml + (index % 2 === 0 ? 8 : -8),
    }));
    expect(fitCalibration(noisy).rmseMl).toBeGreaterThan(2);
  });

  it('asks for more levels when too few distances were measured', () => {
    const points = [100, 100, 150, 150, 200, 200].map(exact);
    expect(() => fitCalibration(points)).toThrow(/5 different distances/u);
  });

  it('refuses points that are too close together to tell apart', () => {
    const points = [1, 1.0000001, 1.0000002, 1.0000003, 1.0000004].map((distanceMm) => ({
      distanceMm,
      ml: 10,
    }));
    expect(() => fitCalibration(points)).toThrow(LarqCalibrationError);
  });
});
