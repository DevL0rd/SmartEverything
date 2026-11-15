import { describe, expect, it } from 'vitest';
import {
  GAP,
  MARGIN,
  PANEL_SIZE,
  placeFitted,
  placePanel,
  settlePanel,
  type Insets,
  type PanelPlacement,
  type Rect,
} from './anchor';
import { floatingSheetFrame } from './compact-panel';

const SAFE: Insets = { top: 24, bottom: 0, left: 0, right: 0 };
const DESKTOP = { width: 1440, height: 900 };
function place(
  anchor: Rect,
  window: { width: number; height: number },
  idiom: 'pointer' | 'touch',
): PanelPlacement {
  return placePanel(anchor, PANEL_SIZE, { window, safeArea: SAFE, idiom });
}

const composer = { x: 400, y: 780, width: 720, height: 96 };

describe('placing the model panel', () => {
  it('opens a popover above the composer, right-aligned to it', () => {
    const { presentation, frame } = place(composer, DESKTOP, 'pointer');
    expect(presentation).toBe('popover');
    expect(frame.width).toBe(400);
    expect(frame.x).toBe(composer.x + composer.width - 400);
    expect(frame.y + frame.height).toBe(composer.y - GAP);
    expect(frame.height).toBe(560);
  });

  it('keeps the popover inside each corner of the window', () => {
    const corners = [
      { x: 0, y: 700, width: 120, height: 60 },
      { x: 1320, y: 700, width: 120, height: 60 },
    ];
    for (const anchor of corners) {
      const { presentation, frame } = place(anchor, DESKTOP, 'pointer');
      expect(presentation).toBe('popover');
      expect(frame.x).toBeGreaterThanOrEqual(MARGIN);
      expect(frame.x + frame.width).toBeLessThanOrEqual(DESKTOP.width - MARGIN);
      expect(frame.y).toBeGreaterThanOrEqual(SAFE.top + MARGIN);
    }
  });

  it('clamps the width to the window on a narrow pointer window', () => {
    const narrow = { width: 360, height: 900 };
    const { frame } = place({ x: 8, y: 780, width: 344, height: 80 }, narrow, 'pointer');
    expect(frame.width).toBe(344);
    expect(frame.x).toBe(MARGIN);
  });

  it('shrinks the popover to the space above the anchor but never below the minimum', () => {
    const anchor = { x: 400, y: 500, width: 720, height: 96 };
    const { presentation, frame } = place(anchor, DESKTOP, 'pointer');
    expect(presentation).toBe('popover');
    expect(frame.height).toBe(500 - SAFE.top - MARGIN - GAP);
    expect(frame.height).toBeGreaterThanOrEqual(PANEL_SIZE.minHeight);
  });

  it('becomes a centred dialog when the space above the anchor is under the minimum', () => {
    const anchor = { x: 400, y: 380, width: 720, height: 96 };
    const { presentation, frame } = place(anchor, DESKTOP, 'pointer');
    expect(presentation).toBe('dialog');
    expect(frame.width).toBe(480);
    expect(frame.height).toBe(560);
    expect(frame.x).toBe((DESKTOP.width - 480) / 2);
    expect(frame.y).toBe((DESKTOP.height - 560) / 2);
  });

  it('becomes a dialog in a short window even when the anchor sits low', () => {
    const short = { width: 1440, height: 460 };
    const { presentation, frame } = place(
      { x: 400, y: 380, width: 720, height: 60 },
      short,
      'pointer',
    );
    expect(presentation).toBe('dialog');
    expect(frame.height).toBe(460 - 2 * MARGIN);
  });

  it('keeps a fitted dialog at the same width as its anchored panel', () => {
    const anchor = { ...composer, y: 380 };
    const size = { ...PANEL_SIZE, dialogWidth: PANEL_SIZE.width };
    const { presentation, frame } = placePanel(anchor, size, {
      window: DESKTOP,
      safeArea: SAFE,
      idiom: 'pointer',
    });
    expect(presentation).toBe('dialog');
    expect(frame.width).toBe(PANEL_SIZE.width);
    expect(frame.x).toBe((DESKTOP.width - frame.width) / 2);
  });

  it('keeps a top-bar picker below its trigger when it changes height', () => {
    const context = {
      window: DESKTOP,
      safeArea: SAFE,
      idiom: 'pointer',
      pointerPlacement: 'below',
    } as const;
    const button = { x: 1200, y: 28, width: 48, height: 48 };
    const open = placePanel(button, PANEL_SIZE, context);
    const lower = { ...button, y: 420 };
    const settled = settlePanel(open, placePanel(lower, PANEL_SIZE, context), 'below');
    expect(open.presentation).toBe('popover');
    expect(open.frame.y).toBe(button.y + button.height + GAP);
    expect(settled.frame.y).toBe(lower.y + lower.height + GAP);
    expect(settled.frame.height).toBeLessThan(open.frame.height);
  });

  it('lets a nested catalogue grow into a centered frame', () => {
    const size = { ...PANEL_SIZE, dialogWidth: 960, maxHeight: 760 };
    const { presentation, frame } = placePanel(composer, size, {
      window: DESKTOP,
      safeArea: SAFE,
      idiom: 'pointer',
      pointerPlacement: 'center',
    });
    expect(presentation).toBe('dialog');
    expect(frame).toEqual({ x: 240, y: 70, width: 960, height: 760 });
  });

  it('uses the full safe width of touch sheets on phones and unfolded displays', () => {
    const phone = place(composer, { width: 390, height: 844 }, 'touch');
    expect(phone.presentation).toBe('sheet');
    expect(phone.frame.width).toBe(366);
    expect(phone.frame.y + phone.frame.height).toBe(836);
    const unfolded = place(composer, { width: 784, height: 800 }, 'touch');
    expect(unfolded.frame.width).toBe(760);
    expect(unfolded.frame.x).toBe(12);
  });

  it('never returns an empty frame, even in a degenerate window', () => {
    for (const idiom of ['pointer', 'touch'] as const) {
      const { frame } = place(
        { x: 0, y: 0, width: 0, height: 0 },
        { width: 10, height: 10 },
        idiom,
      );
      expect(frame.height).toBeGreaterThan(0);
      expect(frame.width).toBeGreaterThan(0);
    }
  });
});

describe('floating sheets', () => {
  it('leaves gutters inside asymmetric system insets', () => {
    expect(
      floatingSheetFrame(
        { width: 784, height: 800 },
        {
          top: 24,
          bottom: 28,
          left: 32,
          right: 10,
        },
      ),
    ).toEqual({ left: 44, width: 718, bottom: 36, maxHeight: 732 });
  });

  it('centres a wider sheet in the usable safe area without changing the height allowance', () => {
    expect(
      floatingSheetFrame(
        { width: 1440, height: 900 },
        { top: 24, bottom: 28, left: 32, right: 10 },
      ),
    ).toEqual({ left: 323, width: 816, bottom: 36, maxHeight: 832 });
  });
});

describe('re-placing an open panel', () => {
  const open = place(composer, DESKTOP, 'pointer');

  it('keeps the same object when nothing moved', () => {
    expect(settlePanel(open, place(composer, DESKTOP, 'pointer'))).toBe(open);
  });

  it('moves with the anchor without growing the height', () => {
    const lower = { ...composer, y: 840 };
    const settled = settlePanel(open, place(lower, DESKTOP, 'pointer'));
    expect(settled.frame.height).toBe(open.frame.height);
    expect(settled.frame.y + settled.frame.height).toBe(lower.y - GAP);
  });

  it('shrinks when the space above the anchor shrinks and does not grow back', () => {
    const raised = { ...composer, y: 540 };
    const shrunk = settlePanel(open, place(raised, DESKTOP, 'pointer'));
    expect(shrunk.frame.height).toBe(540 - SAFE.top - MARGIN - GAP);
    const back = settlePanel(shrunk, place(composer, DESKTOP, 'pointer'));
    expect(back.frame.height).toBe(shrunk.frame.height);
    expect(back.frame.y + back.frame.height).toBe(composer.y - GAP);
  });

  it('switches presentation without keeping the old height', () => {
    const tall = { ...composer, y: 380 };
    const dialog = settlePanel(open, place(tall, DESKTOP, 'pointer'));
    expect(dialog.presentation).toBe('dialog');
    expect(dialog.frame.height).toBe(560);
  });
});

describe('placing a menu inside the window', () => {
  const window = { width: 1440, height: 900 };
  const row = { x: 1200, y: 520, width: 32, height: 32 };

  it('opens below the anchor when the whole menu fits there', () => {
    const placed = placeFitted(row, 240, window, { height: 300, prefer: 'below' });
    expect(placed.vertical).toEqual({ top: row.y + row.height + GAP });
    expect(placed.maxHeight).toBe(300);
  });

  it('flips above the anchor when the menu does not fit below but fits above', () => {
    const placed = placeFitted(row, 240, window, { height: 400, prefer: 'below' });
    expect(placed.vertical).toEqual({ bottom: window.height - row.y + GAP });
    expect(placed.maxHeight).toBe(400);
  });

  it('keeps a menu that prefers above below the anchor when only below has room', () => {
    const top = { x: 100, y: 40, width: 32, height: 32 };
    const placed = placeFitted(top, 240, window, { height: 300, prefer: 'above' });
    expect(placed.vertical).toEqual({ top: top.y + top.height + GAP });
  });

  it('shifts a menu that fits on neither side so it ends at the bottom margin', () => {
    const middle = pointFor(450);
    const placed = placeFitted(middle, 240, window, { height: 600, prefer: 'below' });
    expect(placed.vertical).toEqual({ top: window.height - MARGIN - 600 });
    expect(placed.maxHeight).toBe(600);
  });

  it('caps a menu taller than the window to the window so it scrolls', () => {
    const placed = placeFitted(pointFor(450), 240, window, { height: 2000, prefer: 'below' });
    expect(placed.vertical).toEqual({ top: MARGIN });
    expect(placed.maxHeight).toBe(window.height - 2 * MARGIN);
  });

  it('keeps the menu inside the window horizontally', () => {
    const edge = { x: 1430, y: 100, width: 0, height: 0 };
    expect(placeFitted(edge, 240, window, { height: 100, prefer: 'below' }).left).toBe(1430 - 240);
    const corner = { x: 4, y: 100, width: 0, height: 0 };
    expect(placeFitted(corner, 240, window, { height: 100, prefer: 'below' }).left).toBe(MARGIN);
  });

  it('lines a menu that would overflow up with the right edge of its trigger', () => {
    const trigger = { x: 1376, y: 16, width: 40, height: 40 };
    expect(placeFitted(trigger, 240, window, { height: 100, prefer: 'below' }).left).toBe(
      1416 - 240,
    );
  });
});

function pointFor(y: number): Rect {
  return { x: 700, y, width: 0, height: 0 };
}
