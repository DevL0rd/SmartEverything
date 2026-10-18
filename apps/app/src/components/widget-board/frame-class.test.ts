import { describe, expect, it } from 'vitest';
import { WIDGET_FOOTPRINTS, type BoardClass, type WidgetSize } from '@smarteverything/domain';
import { cellOf, frameOf } from './board-geometry';
import { frameBoxOf, frameClassOf, type FrameClass } from './frame-class';

function contentFrame(
  board: BoardClass,
  size: WidgetSize,
  boardWidth: number,
  idiom: 'touch' | 'pointer',
): FrameClass {
  const columns = { compact: 4, medium: 8, expanded: 12 }[board];
  const cell = cellOf(boardWidth, columns, idiom, 'comfortable');
  const footprint = WIDGET_FOOTPRINTS[board][size];
  const frame = frameOf(cell, { col: 0, row: 0, cols: footprint.columns, rows: footprint.rows });
  return frameClassOf(frameBoxOf(frame, cell.pad, idiom));
}

describe('frameClassOf over the board geometry', () => {
  it('maps the phone board sizes to m and l, with wide repeating medium', () => {
    const classes = (['M', 'W', 'XL'] as const).map((size) =>
      contentFrame('compact', size, 358, 'touch'),
    );
    expect(classes).toStrictEqual(['m', 'm', 'l']);
  });

  it('maps the tablet board sizes to m, w and xl', () => {
    const classes = (['M', 'W', 'XL'] as const).map((size) =>
      contentFrame('medium', size, 692, 'touch'),
    );
    expect(classes).toStrictEqual(['m', 'w', 'xl']);
  });

  it('maps the desktop board sizes to xs for the short box, w and xl', () => {
    const classes = (['M', 'W', 'XL'] as const).map((size) =>
      contentFrame('expanded', size, 1112, 'pointer'),
    );
    expect(classes).toStrictEqual(['xs', 'w', 'xl']);
  });
});

describe('frameClassOf thresholds', () => {
  const box = (width: number, height: number): ReturnType<typeof frameBoxOf> => ({
    width,
    height,
    idiom: 'touch',
  });

  it('switches to wide at 560 and to tall at 200', () => {
    expect(frameClassOf(box(559, 199))).toBe('m');
    expect(frameClassOf(box(560, 199))).toBe('w');
    expect(frameClassOf(box(559, 200))).toBe('l');
    expect(frameClassOf(box(560, 200))).toBe('xl');
  });

  it('switches to narrow below 200 and to short below 128', () => {
    expect(frameClassOf(box(199, 200))).toBe('s');
    expect(frameClassOf(box(200, 200))).toBe('l');
    expect(frameClassOf(box(300, 127))).toBe('xs');
    expect(frameClassOf(box(300, 128))).toBe('m');
  });
});

describe('frameBoxOf', () => {
  it('removes the card padding from both sides and keeps the idiom', () => {
    const box = frameBoxOf({ left: 5, top: 5, width: 266, height: 160 }, 20, 'pointer');
    expect(box).toStrictEqual({ width: 226, height: 120, idiom: 'pointer' });
  });
});
