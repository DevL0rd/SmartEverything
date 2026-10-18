import { describe, expect, it } from 'vitest';
import {
  GAP,
  MARGIN,
  PANEL_SIZE,
  placePanel,
  settlePanel,
  type Insets,
  type PanelPlacement,
  type Rect,
} from './anchor';

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

  it('uses a bottom sheet for touch, full width on a phone and centred 560 on a tablet', () => {
    const phone = place(composer, { width: 390, height: 844 }, 'touch');
    expect(phone.presentation).toBe('sheet');
    expect(phone.frame.width).toBe(390);
    expect(phone.frame.y + phone.frame.height).toBe(844);
    const tablet = place(composer, { width: 1000, height: 800 }, 'touch');
    expect(tablet.frame.width).toBe(560);
    expect(tablet.frame.x).toBe(220);
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
