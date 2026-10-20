import { describe, expect, it } from 'vitest';
import { dropAt, foldCandidate, shiftTarget, type DragRow } from './nav-drag';

const H = 40;

function row(key: string, index: number, extra: Partial<DragRow> = {}): DragRow {
  return { key, folder: false, parent: null, fixed: false, y: index * H, height: H, ...extra };
}

const ROWS: readonly DragRow[] = [
  row('a', 0),
  row('f', 1, { folder: true }),
  row('m1', 2, { parent: 'f' }),
  row('m2', 3, { parent: 'f' }),
  row('b', 4),
];

describe('dropping a navigation row', () => {
  it('drops before a row when the pointer is in its upper half', () => {
    expect(dropAt(ROWS, 'b', 5)?.place).toEqual({ parent: null, before: 'a' });
    expect(dropAt(ROWS, 'b', 5)?.line).toBe(0);
  });

  it('drops after a row, before the next sibling, in the lower half', () => {
    const drop = dropAt(ROWS, 'b', 35);
    expect(drop?.place).toEqual({ parent: null, before: 'f' });
    expect(drop?.line).toBe(H);
  });

  it('drops into a folder when the pointer is over its row', () => {
    const drop = dropAt(ROWS, 'a', 1.5 * H);
    expect(drop?.into).toBe('f');
    expect(drop?.place).toEqual({ parent: 'f', before: null });
  });

  it('drops before a folder from its top quarter', () => {
    expect(dropAt(ROWS, 'a', H + 2)?.place).toEqual({ parent: null, before: 'f' });
  });

  it('keeps a member inside its folder when dropped on a sibling member', () => {
    expect(dropAt(ROWS, 'm1', 3.2 * H + 20)?.place).toEqual({ parent: 'f', before: null });
    expect(dropAt(ROWS, 'm2', 2 * H + 5)?.place).toEqual({ parent: 'f', before: 'm1' });
  });

  it('places a folder after another folder below all of its members', () => {
    const rows = [
      row('f', 0, { folder: true }),
      row('m1', 1, { parent: 'f' }),
      row('g', 2, { folder: true }),
      row('h', 3),
    ];
    const drop = dropAt(rows, 'g', 0.75 * H);
    expect(drop?.place).toEqual({ parent: null, before: 'g' });
    expect(drop?.line).toBe(2 * H);
    expect(dropAt(rows, 'h', 1.8 * H)?.place).toEqual({ parent: 'f', before: null });
  });

  it('never drops a folder into a folder or on itself', () => {
    expect(dropAt(ROWS, 'f', 2.5 * H)).toBeNull();
    expect(dropAt(ROWS, 'f', 1.5 * H)).toBeNull();
  });

  it('drops past the last row at the end of the top level', () => {
    const drop = dropAt(ROWS, 'a', 9 * H);
    expect(drop?.place).toEqual({ parent: null, before: null });
    expect(drop?.line).toBe(5 * H);
  });

  it('drops above the first row before it', () => {
    expect(dropAt(ROWS, 'b', -10)?.place).toEqual({ parent: null, before: 'a' });
  });

  it('has nothing to do for an unknown row or an empty list', () => {
    expect(dropAt(ROWS, 'zzz', 10)).toBeNull();
    expect(dropAt([], 'a', 10)).toBeNull();
  });
});

describe('moving a row with the keyboard or a screen reader', () => {
  it('moves up before the previous sibling and down after the next one', () => {
    expect(shiftTarget(ROWS, 'b', -1)).toEqual({ parent: null, before: 'f' });
    expect(shiftTarget(ROWS, 'a', 1)).toEqual({ parent: null, before: 'b' });
    expect(shiftTarget(ROWS, 'f', 1)).toEqual({ parent: null, before: null });
  });

  it('stays inside the folder for members and stops at the ends', () => {
    expect(shiftTarget(ROWS, 'm2', -1)).toEqual({ parent: 'f', before: 'm1' });
    expect(shiftTarget(ROWS, 'm2', 1)).toBeNull();
    expect(shiftTarget(ROWS, 'a', -1)).toBeNull();
    expect(shiftTarget(ROWS, 'nothing', 1)).toBeNull();
  });
});

describe('dropping one row onto another to make a folder', () => {
  const MIDDLE = 4 * H + H / 2;

  it('offers a plain top-level row only in its middle band', () => {
    expect(foldCandidate(ROWS, 'a', MIDDLE)).toBe('b');
    expect(foldCandidate(ROWS, 'a', 4 * H + 2)).toBeNull();
    expect(foldCandidate(ROWS, 'a', 5 * H - 2)).toBeNull();
  });

  it('offers nothing over itself, a folder, a folder member or when a folder is dragged', () => {
    expect(foldCandidate(ROWS, 'a', H / 2)).toBeNull();
    expect(foldCandidate(ROWS, 'a', 1.5 * H)).toBeNull();
    expect(foldCandidate(ROWS, 'a', 2.5 * H)).toBeNull();
    expect(foldCandidate(ROWS, 'f', MIDDLE)).toBeNull();
  });

  it('keeps reordering until the hover has armed the target', () => {
    expect(dropAt(ROWS, 'a', MIDDLE)?.fold).toBe(false);
    expect(dropAt(ROWS, 'a', MIDDLE, 'm1')?.fold).toBe(false);
  });

  it('creates a folder on the armed target when the pointer stays in its middle band', () => {
    const drop = dropAt(ROWS, 'a', MIDDLE, 'b');
    expect(drop).toMatchObject({ fold: true, into: 'b' });
  });

  it('falls back to reordering when the pointer left the middle band', () => {
    expect(dropAt(ROWS, 'a', 4 * H + 2, 'b')?.fold).toBe(false);
  });

  it('refuses to fold into or with a fixed row', () => {
    const fixedTarget = [...ROWS.slice(0, 4), row('b', 4, { fixed: true })];
    expect(dropAt(fixedTarget, 'a', MIDDLE, 'b')?.fold).toBe(false);
    const fixedDragged = [row('a', 0, { fixed: true }), ...ROWS.slice(1)];
    expect(dropAt(fixedDragged, 'a', MIDDLE, 'b')?.fold).toBe(false);
  });
});
