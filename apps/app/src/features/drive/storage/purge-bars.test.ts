import { describe, expect, it } from 'vitest';
import { bytes } from '../../../format/number';
import { purgeShapesOf, purgeSummaryOf, purgeTotalsOf } from './purge-bars';

const GB = 1024 ** 3;

const PURGES = [
  { month: '2026-11', trashBytes: 2 * GB, versionBytes: 6 * GB },
  { month: '2026-12', trashBytes: 0, versionBytes: 0 },
  { month: '2027-01', trashBytes: GB, versionBytes: 0 },
  { month: '2027-02', trashBytes: 0, versionBytes: 3 * GB },
];

describe('What frees when', () => {
  it('adds up old versions and trash over every month the hub sends', () => {
    expect(purgeTotalsOf(PURGES)).toEqual({ versionBytes: 9 * GB, trashBytes: 3 * GB });
  });

  it('stacks trash on old versions and leaves empty months without a bar', () => {
    const shapes = purgeShapesOf(PURGES, 400, 'grey');
    expect(shapes.map((shape) => shape.key)).toEqual([
      '2026-11-versions',
      '2026-11-trash',
      '2027-01-trash',
      '2027-02-versions',
    ]);
    const [versions, trash] = shapes;
    expect(trash?.bottom).toBeLessThan(versions?.top ?? 0);
    expect(trash?.fill).toBe('grey');
    expect(versions?.fill).toBeUndefined();
    expect(versions?.radii.top).toBe(0);
    expect(trash?.radii.top).toBeGreaterThan(0);
  });

  it('draws the fullest month to the top of the plot', () => {
    const shapes = purgeShapesOf(PURGES, 400, 'grey');
    const top = Math.min(...shapes.map((shape) => shape.top));
    expect(top).toBeCloseTo(0, 0);
  });

  it('reads the totals and the month span out loud', () => {
    const summary = purgeSummaryOf(PURGES);
    expect(summary).toContain(`old versions ${bytes(9 * GB)}`);
    expect(summary).toContain(`trash ${bytes(3 * GB)}`);
    expect(purgeSummaryOf([])).toBe(
      `Space that frees up each month: old versions ${bytes(0)}, trash ${bytes(0)}`,
    );
  });
});
