import { describe, expect, it } from 'vitest';
import { localModelRect, modelScrollBounds, modelWithinViewport } from './scroll-model-position';

const layer = { x: 0, y: 0, pageX: 20, pageY: 400, width: 360, height: 140 };
const model = { x: 0, y: 0, pageX: 38, pageY: 420, width: 96, height: 96 };

describe('a scroll-owned model surface', () => {
  it('retains its placement when the scroll compositor moves model and layer together', () => {
    expect(localModelRect(model, layer)).toEqual({ x: 18, y: 20, width: 96, height: 96 });
    expect(localModelRect({ ...model, pageY: 112 }, { ...layer, pageY: 92 })).toEqual(
      localModelRect(model, layer),
    );
  });

  it('moves the model for a real layout change and clears a detached anchor', () => {
    expect(localModelRect({ ...model, pageY: 432 }, layer)?.y).toBe(32);
    expect(localModelRect(null, layer)).toBeNull();
    expect(localModelRect(model, null)).toBeNull();
  });

  it('keeps a stable content range and changes visibility at the viewport edges', () => {
    const viewport = { ...layer, pageY: 100, height: 300 };
    const bounds = modelScrollBounds(model, viewport, 50);
    expect(bounds).toEqual({ top: 370, bottom: 466, viewport: 300 });
    expect(modelScrollBounds({ ...model, pageY: 310 }, viewport, 160)).toEqual(bounds);
    expect(modelWithinViewport(bounds, 70)).toBe(false);
    expect(modelWithinViewport(bounds, 71)).toBe(true);
    expect(modelWithinViewport(bounds, 465)).toBe(true);
    expect(modelWithinViewport(bounds, 466)).toBe(false);
    expect(modelWithinViewport(null, 400)).toBe(false);
  });

  it('uses the current widget motion at the viewport edge before Fabric commits it', () => {
    const viewport = { ...layer, pageY: 100, height: 300 };
    const committedTop = 250;
    const scrolled = 50;
    const bounds = modelScrollBounds(model, viewport, scrolled, committedTop);
    expect(bounds).toEqual({ top: 120, bottom: 216, viewport: 300 });
    expect(modelWithinViewport(bounds, scrolled, committedTop)).toBe(false);
    expect(modelWithinViewport(bounds, scrolled, 230)).toBe(false);
    expect(modelWithinViewport(bounds, scrolled, 229)).toBe(true);
    expect(modelWithinViewport(bounds, 1050, 1229)).toBe(true);
  });
});
