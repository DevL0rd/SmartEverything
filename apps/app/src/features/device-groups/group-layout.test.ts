import { describe, expect, it } from 'vitest';
import { planChipGrid, planChips, planRows, rowMetrics, spanParts } from './group-layout';

const PHONE_L = {
  width: 326,
  height: 324,
  idiom: 'touch',
  total: 6,
  wide: false,
  expandedIndex: null,
  expandedExtra: 90,
  lines: 0,
  note: false,
} as const;

describe('planRows', () => {
  it('shows three rows and a Show all row on a phone Large widget with six lights', () => {
    const plan = planRows(PHONE_L);
    expect(plan.columns).toBe(1);
    expect(plan.count).toBe(3);
    expect(plan.hidden).toBe(3);
  });

  it('shows every light when they all fit', () => {
    const plan = planRows({ ...PHONE_L, total: 3 });
    expect(plan.count).toBe(3);
    expect(plan.hidden).toBe(0);
  });

  it('keeps the expanded row visible by pushing earlier rows out', () => {
    const plan = planRows({ ...PHONE_L, expandedIndex: 5, total: 6 });
    expect(5).toBeGreaterThanOrEqual(plan.start);
    expect(5).toBeLessThan(plan.start + plan.count);
  });

  it('gives expanding room by showing fewer rows', () => {
    const collapsed = planRows({ ...PHONE_L, total: 20 });
    const expanded = planRows({ ...PHONE_L, total: 20, expandedIndex: 0 });
    expect(expanded.count).toBeLessThan(collapsed.count);
  });

  it('uses three columns from 1000 px and two below on Extra large', () => {
    expect(
      planRows({ ...PHONE_L, width: 1072, height: 296, idiom: 'pointer', wide: true, total: 20 })
        .columns,
    ).toBe(3);
    expect(planRows({ ...PHONE_L, width: 660, height: 324, wide: true, total: 20 }).columns).toBe(
      2,
    );
  });

  it('shrinks the rows to make room for result and notice lines', () => {
    expect(planRows({ ...PHONE_L, total: 20, lines: 2 }).count).toBeLessThan(
      planRows({ ...PHONE_L, total: 20 }).count,
    );
  });

  it('keeps one row when the frame is too short', () => {
    expect(planRows({ ...PHONE_L, height: 150, total: 6 }).count).toBe(1);
  });

  it('uses denser rows for a pointer', () => {
    expect(rowMetrics('pointer').row).toBeLessThan(rowMetrics('touch').row);
  });
});

describe('planChips', () => {
  it('shows every chip that fits and counts the rest', () => {
    expect(planChips(326, 2)).toEqual({ shown: 2, hidden: 0 });
    const many = planChips(326, 12);
    expect(many.shown + many.hidden).toBe(12);
    expect(many.hidden).toBeGreaterThan(0);
    expect(many.shown).toBeGreaterThanOrEqual(1);
  });
});

describe('planChipGrid', () => {
  it('fills two rows on a tablet Wide widget and leaves a slot for the count', () => {
    const plan = planChipGrid(660, 140, 12);
    expect(plan.leftWidth).toBe(300);
    expect(plan.shown + 1).toBe(plan.columns * 2);
    expect(plan.chipWidth * plan.columns + 8 * (plan.columns - 1)).toBeLessThanOrEqual(
      660 - 300 - 16,
    );
    expect(plan.hidden).toBe(12 - plan.shown);
  });

  it('uses one row at desktop height and shows all when they fit', () => {
    const plan = planChipGrid(1072, 120, 4);
    expect(plan.shown).toBe(4);
    expect(plan.hidden).toBe(0);
  });
});

describe('spanParts', () => {
  const items = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));

  it('keeps one block when nothing is expanded', () => {
    expect(spanParts(items, 3, null)).toEqual([{ items, columns: 3 }]);
  });

  it('gives the expanded row its own full-width line between the columns around it', () => {
    expect(
      spanParts(items, 3, 'c').map((part) => [part.items.map((i) => i.id), part.columns]),
    ).toEqual([
      [['a', 'b'], 3],
      [['c'], 1],
      [['d', 'e'], 3],
    ]);
  });

  it('drops empty blocks when the expanded row is first or last', () => {
    expect(spanParts(items, 2, 'a').map((part) => part.columns)).toEqual([1, 2]);
    expect(spanParts(items, 2, 'e').map((part) => part.columns)).toEqual([2, 1]);
  });

  it('needs no extra line in a single column', () => {
    expect(spanParts(items, 1, 'c')).toEqual([{ items, columns: 1 }]);
  });
});

describe('planRows on the capped Devices card', () => {
  const caps = [
    { idiom: 'touch', height: 520, width: 326, wide: false },
    { idiom: 'touch', height: 520, width: 700, wide: true },
    { idiom: 'pointer', height: 460, width: 1200, wide: true },
  ] as const;

  for (const cap of caps) {
    for (const total of [1, 6, 55, 200]) {
      it(`bounds ${String(total)} lights at ${String(cap.width)}px ${cap.idiom}`, () => {
        const plan = planRows({ ...PHONE_L, ...cap, total });
        const metrics = rowMetrics(cap.idiom);
        const rows = Math.ceil(plan.count / plan.columns);
        const used =
          metrics.header +
          metrics.master +
          metrics.white +
          metrics.gap * 3 +
          rows * (metrics.row + metrics.gap) +
          (plan.hidden > 0 ? metrics.more : 0);
        expect(used).toBeLessThanOrEqual(cap.height);
        expect(plan.hidden).toBe(total - plan.count);
        expect(plan.count).toBeLessThanOrEqual(total);
        if (total === 1) expect(plan.hidden).toBe(0);
      });
    }
  }
});
