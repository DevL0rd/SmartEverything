import { describe, expect, it } from 'vitest';
import {
  bytesOf,
  celsius,
  ghz,
  orNull,
  percent,
  rate,
  significant,
  toStep,
  watts,
} from '../../src/node/collectors/rounding';

describe('rounding at the source', () => {
  it('rounds to a step without floating point noise', () => {
    expect(toStep(0.30000000000000004, 0.1)).toBe(0.3);
    expect(toStep(12.26, 0.5)).toBe(12.5);
  });

  it('keeps percentages inside 0 to 100 with one decimal', () => {
    expect(percent(100.04)).toBe(100);
    expect(percent(-0.2)).toBe(0);
    expect(percent(33.349)).toBe(33.3);
  });

  it('rounds temperatures to half degrees, power to tenths, clocks to hundredths', () => {
    expect(celsius(41.8)).toBe(42);
    expect(celsius(41.7)).toBe(41.5);
    expect(watts(12.34)).toBe(12.3);
    expect(watts(-1)).toBe(0);
    expect(ghz(4.2149)).toBe(4.21);
  });

  it('keeps three significant digits of a rate and never goes negative', () => {
    expect(rate(12_345_678)).toBe(12_300_000);
    expect(rate(0.04567)).toBe(0.0457);
    expect(rate(-5)).toBe(0);
    expect(significant(0, 3)).toBe(0);
  });

  it('rounds bytes to a thousandth of the total', () => {
    expect(bytesOf(1_234_567, 1_000_000)).toBe(1_235_000);
    expect(bytesOf(7, 0)).toBe(7);
  });

  it('passes null through', () => {
    expect(orNull(null, percent)).toBeNull();
    expect(orNull(50.04, percent)).toBe(50);
  });
});
