import { describe, expect, it } from 'vitest';
import { ZOOM_MAX, ZOOM_TAP, clampZoom, tapZoomOf, wheelZoomed, type ZoomView } from './zoomable';

const FRAME = { width: 800, height: 600 };

function screenOf(view: ZoomView, contentX: number, contentY: number): { x: number; y: number } {
  return {
    x: FRAME.width / 2 + view.x + contentX * view.zoom,
    y: FRAME.height / 2 + view.y + contentY * view.zoom,
  };
}

describe('zoomable', () => {
  it('keeps a pinch between the fitted size and the deepest zoom', () => {
    expect(clampZoom(0.4)).toBe(1);
    expect(clampZoom(3)).toBe(3);
    expect(clampZoom(40)).toBe(ZOOM_MAX);
  });

  it('zooms in on a double tap when fitted and back to fitted when zoomed', () => {
    expect(tapZoomOf(1)).toBe(ZOOM_TAP);
    expect(tapZoomOf(1.2)).toBe(1);
    expect(tapZoomOf(ZOOM_MAX)).toBe(1);
  });

  it('zooms in on a wheel turn and keeps the point under the pointer still', () => {
    const turn = { pixels: -300, x: 600, y: 150, ...FRAME };
    const next = wheelZoomed({ zoom: 1, x: 0, y: 0 }, turn);
    expect(next.zoom).toBe(2);
    const under = { x: turn.x - FRAME.width / 2, y: turn.y - FRAME.height / 2 };
    expect(screenOf(next, under.x, under.y)).toEqual({ x: turn.x, y: turn.y });
  });

  it('keeps the pointed spot still when zooming out of an already moved photo', () => {
    const from = { zoom: 4, x: -300, y: 120 };
    const turn = { pixels: 300, x: 250, y: 400, ...FRAME };
    const next = wheelZoomed(from, turn);
    expect(next.zoom).toBe(2);
    const contentX = (turn.x - FRAME.width / 2 - from.x) / from.zoom;
    const contentY = (turn.y - FRAME.height / 2 - from.y) / from.zoom;
    const at = screenOf(next, contentX, contentY);
    expect(at.x).toBeCloseTo(turn.x);
    expect(at.y).toBeCloseTo(turn.y);
  });

  it('settles back to the fitted, centred photo when the wheel zooms all the way out', () => {
    expect(
      wheelZoomed({ zoom: 2, x: 140, y: -60 }, { pixels: 900, x: 10, y: 10, ...FRAME }),
    ).toEqual({ zoom: 1, x: 0, y: 0 });
  });

  it('stops at the deepest zoom', () => {
    expect(
      wheelZoomed({ zoom: 1, x: 0, y: 0 }, { pixels: -9000, x: 400, y: 300, ...FRAME }).zoom,
    ).toBe(ZOOM_MAX);
  });
});
