import { describe, expect, it } from 'vitest';
import {
  airRowFit,
  airStackFit,
  comfortDialFit,
  outdoorFit,
  outdoorMetricHeight,
  roomGridFit,
  roomRowHeight,
  rowsOf,
  supplyListFit,
  supplyRingFit,
  type BodyBox,
} from './climate-fit';

const PHONE_M: BodyBox = { width: 348, height: 87, idiom: 'touch' };
const PHONE_XL: BodyBox = { width: 348, height: 271, idiom: 'touch' };
const WIDE_W: BodyBox = { width: 1100, height: 87, idiom: 'touch' };
const WIDE_XL: BodyBox = { width: 1100, height: 271, idiom: 'touch' };
const DESKTOP_M: BodyBox = { width: 530, height: 75, idiom: 'pointer' };

describe('airRowFit', () => {
  it('fills the body height with the dial and leaves out labels that do not fit', () => {
    expect(airRowFit(PHONE_M)).toEqual({ dial: 87, big: false, labels: false });
    expect(airRowFit(DESKTOP_M)).toEqual({ dial: 75, big: false, labels: false });
  });

  it('grows the dial to the tall tier and keeps the scale labels', () => {
    expect(airRowFit(WIDE_XL)).toEqual({ dial: 271, big: true, labels: true });
  });

  it('keeps half the width for the verdict on narrow bodies', () => {
    expect(airRowFit({ width: 120, height: 87, idiom: 'touch' }).dial).toBe(60);
  });
});

describe('airStackFit', () => {
  it('sizes the dial to the height left under the verdict and the scale', () => {
    expect(airStackFit(PHONE_XL)).toEqual({ dial: 163, big: true, labels: true });
  });

  it('never makes the dial wider than the body', () => {
    expect(airStackFit({ width: 120, height: 271, idiom: 'touch' }).dial).toBe(120);
  });
});

describe('comfortDialFit', () => {
  it('stacks the label under the dial when three readings share a phone width', () => {
    expect(comfortDialFit(PHONE_M, 3)).toEqual({ stacked: true, dial: 49 });
    expect(comfortDialFit(PHONE_XL, 3)).toEqual({ stacked: true, dial: 108 });
  });

  it('puts the label beside a full-height dial when the cell is wide enough', () => {
    expect(comfortDialFit(DESKTOP_M, 3)).toEqual({ stacked: false, dial: 75 });
    expect(comfortDialFit(WIDE_XL, 3)).toEqual({ stacked: false, dial: 271 });
    expect(comfortDialFit(PHONE_M, 1)).toEqual({ stacked: false, dial: 87 });
  });
});

describe('roomGridFit', () => {
  it('derives the row height from the type scale', () => {
    expect(roomRowHeight('touch')).toBe(70);
    expect(roomRowHeight('pointer')).toBe(68);
  });

  it('shows the whole rooms that fit the body', () => {
    expect(roomGridFit(PHONE_M, 4, 3)).toEqual({ columns: 1, shown: 1, wells: false });
    expect(roomGridFit(DESKTOP_M, 3, 3)).toEqual({ columns: 1, shown: 1, wells: true });
    expect(roomGridFit(PHONE_XL, 5, 3)).toEqual({ columns: 1, shown: 3, wells: false });
  });

  it('keeps the reading icons while every reading fits on one line', () => {
    expect(roomGridFit(PHONE_XL, 5, 2).wells).toBe(true);
  });

  it('adds columns on wide bodies', () => {
    expect(roomGridFit(WIDE_XL, 5, 3)).toEqual({ columns: 2, shown: 5, wells: true });
    expect(roomGridFit(WIDE_XL, 2, 3)).toEqual({ columns: 2, shown: 2, wells: true });
  });
});

describe('outdoorFit', () => {
  it('derives the comparison height from the type scale', () => {
    expect(outdoorMetricHeight('touch')).toBe(76);
    expect(outdoorMetricHeight('pointer')).toBe(72);
  });

  it('shows the comparisons that fit instead of a fixed count', () => {
    expect(outdoorFit(PHONE_M, 3)).toEqual({ columns: 1, shown: 1, hintLines: 0 });
    expect(outdoorFit(DESKTOP_M, 3)).toEqual({ columns: 2, shown: 2, hintLines: 0 });
    expect(outdoorFit(WIDE_W, 3)).toEqual({ columns: 3, shown: 3, hintLines: 0 });
    expect(outdoorFit(PHONE_XL, 3)).toEqual({ columns: 1, shown: 3, hintLines: 0 });
  });

  it('gives the hint the lines left under the comparisons', () => {
    expect(outdoorFit(WIDE_XL, 3)).toEqual({ columns: 3, shown: 3, hintLines: 2 });
    expect(outdoorFit({ width: 1100, height: 120, idiom: 'touch' }, 3).hintLines).toBe(1);
  });
});

describe('supplyListFit', () => {
  it('shows every line when the rows fit', () => {
    expect(supplyListFit(PHONE_M, 2)).toEqual({ columns: 1, shown: 2, more: 0 });
    expect(supplyListFit({ width: 700, height: 87, idiom: 'touch' }, 4)).toEqual({
      columns: 3,
      shown: 4,
      more: 0,
    });
  });

  it('keeps room for the more line when the rows do not fit', () => {
    expect(supplyListFit(PHONE_M, 4)).toEqual({ columns: 1, shown: 1, more: 3 });
    expect(supplyListFit(PHONE_XL, 8)).toEqual({ columns: 1, shown: 5, more: 3 });
  });

  it('has no fixed cap on a roomy body', () => {
    expect(supplyListFit(WIDE_XL, 12)).toEqual({ columns: 5, shown: 12, more: 0 });
  });
});

describe('supplyRingFit', () => {
  it('scales the rings and their stroke to the body', () => {
    expect(supplyRingFit(PHONE_XL, 3)).toEqual({ ring: 105, thickness: 9 });
    expect(supplyRingFit(WIDE_XL, 3)).toEqual({ ring: 207, thickness: 17 });
  });

  it('falls back to the list when the rings would be too small', () => {
    expect(supplyRingFit(PHONE_M, 2)).toBeNull();
    expect(supplyRingFit(PHONE_XL, 4)).toBeNull();
    expect(supplyRingFit(PHONE_XL, 0)).toBeNull();
  });
});

describe('rowsOf', () => {
  it('splits items into rows of the column count', () => {
    expect(rowsOf([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
