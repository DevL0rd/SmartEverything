import { describe, expect, it } from 'vitest';
import { forecastSupply, type SupplySample } from '../src';

const DAY = 86_400_000;

function samples(levels: readonly number[], pages = true): readonly SupplySample[] {
  return levels.map((level, index) => ({
    at: index * DAY,
    level,
    pages: pages ? index * 20 : null,
  }));
}

describe('supply forecast', () => {
  it('fits the burn rate by least squares and says when it will be empty', () => {
    const forecast = forecastSupply(samples([100, 90, 80, 70]));
    expect(forecast?.percentPerDay).toBeCloseTo(10, 6);
    expect(forecast?.daysLeft).toBeCloseTo(7, 6);
    expect(forecast?.emptyAt).toBeCloseTo(3 * DAY + 7 * DAY, 0);
    expect(forecast?.percentPer100Pages).toBeCloseTo(50, 6);
  });

  it('leaves out the per page rate when pages are not known', () => {
    expect(forecastSupply(samples([100, 90, 80, 70], false))?.percentPer100Pages).toBeNull();
  });

  it('needs three samples over two days and a falling level', () => {
    expect(forecastSupply([])).toBeNull();
    expect(forecastSupply(samples([100, 90]))).toBeNull();
    expect(
      forecastSupply([
        { at: 0, level: 90, pages: null },
        { at: 1000, level: 80, pages: null },
        { at: 2000, level: 70, pages: null },
      ]),
    ).toBeNull();
    expect(forecastSupply(samples([50, 50, 50, 50]))).toBeNull();
    expect(forecastSupply(samples([50, 60, 70, 80]))).toBeNull();
  });

  it('returns nothing when all samples share one time', () => {
    const same = [0, 0, 0].map((at, index) => ({
      at: at + (index === 2 ? 3 * DAY : 0),
      level: 90 - index,
      pages: null,
    }));
    expect(forecastSupply(same)).not.toBeNull();
    const flat = [0, 0, 0].map(() => ({ at: 0, level: 90, pages: null }));
    expect(forecastSupply(flat)).toBeNull();
  });

  it('never reports negative days left', () => {
    const forecast = forecastSupply([
      { at: 0, level: 30, pages: null },
      { at: DAY, level: 20, pages: null },
      { at: 3 * DAY, level: -5, pages: null },
    ]);
    expect(forecast?.daysLeft).toBe(0);
  });

  it('skips the per page rate when pages do not fall with the level', () => {
    const odd = [100, 90, 80, 70].map((level, index) => ({ at: index * DAY, level, pages: 100 }));
    expect(forecastSupply(odd)?.percentPer100Pages).toBeNull();
    const up = [100, 90, 80, 70].map((level, index) => ({
      at: index * DAY,
      level,
      pages: 300 - index * 20,
    }));
    expect(forecastSupply(up)?.percentPer100Pages).toBeNull();
  });
});
