import { Texture } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVisibilityRegistry } from '../../../components/house-map/live-visibility/registry';
import { fanSpec } from '../visual/visual-fixture';
import type { FrameScheduler } from './frame-loop';
import { startCanvas, type CanvasSetup } from './live-canvas';
import { LiveSurface } from './live-surface';
import { createLiveRenderer, type LiveRect, type LiveRenderer } from './renderer-core';
import { fakeGl, type FakeGl } from './renderer-fixture';
import { LiveViewSet } from './visible-set';

interface Harness {
  readonly canvas: EventTarget;
  readonly surface: LiveSurface;
  readonly setup: CanvasSetup<EventTarget>;
  readonly tick: () => void;
  readonly gl: FakeGl;
  readonly moveTo: (rect: LiveRect) => void;
  readonly moved: () => void;
  readonly released: () => number;
  readonly restored: () => number;
  readonly frames: Frames;
}

interface Frames {
  readonly scheduler: FrameScheduler;
  readonly tick: () => void;
  readonly pending: () => boolean;
  readonly slow: (frameMs: number) => void;
}

function scheduler(): Frames {
  const queue = new Map<number, (nowMs: number) => void>();
  let next = 0;
  let clock = 0;
  let cost = 0;
  return {
    scheduler: {
      request: (callback): number => {
        next += 1;
        queue.set(next, callback);
        return next;
      },
      cancel: (handle): void => {
        queue.delete(handle);
      },
      now: (): number => {
        clock += cost;
        return clock;
      },
    },
    tick: (): void => {
      const due = [...queue.values()];
      queue.clear();
      for (const callback of due) callback(16);
    },
    pending: (): boolean => queue.size > 0,
    slow: (frameMs): void => {
      cost = frameMs;
    },
  };
}

function harness(signals: Record<string, number> = { speed: 0.5 }): Harness {
  const surface = new LiveSurface(new LiveViewSet(createVisibilityRegistry()));
  surface.join('fan', {
    spec: fanSpec(),
    model: { specHash: 'fan', lod: 0, finish: null, params: {} },
    view: 'tile',
    theme: 'dark',
    signals,
    reduced: false,
    functioning: true,
  });
  surface.set.report('fan', { onScreen: true, screenFocused: true });
  const frames = scheduler();
  let released = 0;
  let restored = 0;
  let at: LiveRect = { x: 0, y: 0, width: 80, height: 80 };
  let onMoved: () => void = (): undefined => undefined;
  const gl = fakeGl();
  const place = (renderer: LiveRenderer): void => {
    for (const id of renderer.viewIds()) renderer.place(id, at, at);
  };
  const setup: CanvasSetup<EventTarget> = {
    surface,
    scheduler: frames.scheduler,
    open: () => ({
      renderer: createLiveRenderer(gl.gl, new Texture()),
      release: (): void => {
        released += 1;
      },
    }),
    place,
    watchLayout: (listener) => {
      onMoved = listener;
      return (): void => {
        onMoved = (): undefined => undefined;
      };
    },
    onRestored: (): void => {
      restored += 1;
    },
  };
  const canvas = new EventTarget();
  return {
    canvas,
    surface,
    setup,
    tick: frames.tick,
    gl,
    moveTo: (rect): void => {
      at = rect;
    },
    moved: (): void => {
      onMoved();
    },
    released: (): number => released,
    restored: (): number => restored,
    frames,
  };
}

describe('the web live canvas', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'window',
      Object.assign(new EventTarget(), { innerWidth: 400, innerHeight: 800, devicePixelRatio: 1 }),
    );
    vi.stubGlobal('document', new EventTarget());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the stills again when the context is lost and stops drawing', () => {
    const { canvas, surface, setup, tick, released } = harness();
    const running = startCanvas(canvas, setup);
    tick();
    expect(surface.isDrawn('fan')).toBe(true);
    const lost = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true);
    expect(surface.isDrawn('fan')).toBe(false);
    expect(released()).toBe(1);
    running.invalidate();
    tick();
    expect(surface.isDrawn('fan')).toBe(false);
    running.dispose();
    expect(released()).toBe(1);
  });

  it('clears the canvas as soon as the last live view stops being visible and brings it back', () => {
    const { canvas, surface, setup, tick, gl, frames } = harness({ speed: 0 });
    const running = startCanvas(canvas, setup);
    tick();
    expect(surface.isDrawn('fan')).toBe(true);
    const drawn = gl.calls.length;
    const cleared = gl.clears();
    surface.set.report('fan', { screenFocused: false });
    tick();
    expect(gl.clears()).toBeGreaterThan(cleared);
    expect(gl.calls).toHaveLength(drawn);
    expect(surface.isDrawn('fan')).toBe(false);
    expect(frames.pending()).toBe(false);
    surface.set.report('fan', { screenFocused: true });
    tick();
    expect(gl.calls.length).toBeGreaterThan(drawn);
    expect(surface.isDrawn('fan')).toBe(true);
    running.dispose();
  });

  it('places a still view again when the layout moves it, without drawing until then', () => {
    const { canvas, setup, tick, gl, moveTo, moved } = harness({ speed: 0 });
    const running = startCanvas(canvas, setup);
    tick();
    tick();
    const settled = gl.calls.length;
    expect(settled).toBeGreaterThan(0);
    const before = gl.calls.at(-1)?.viewport;
    moveTo({ x: 200, y: 300, width: 80, height: 80 });
    tick();
    expect(gl.calls).toHaveLength(settled);
    moved();
    tick();
    expect(gl.calls.length).toBeGreaterThan(settled);
    expect(gl.calls.at(-1)?.viewport).not.toEqual(before);
    running.dispose();
  });

  it('wakes an idle loop after a quality step and redraws every view at the new scale', () => {
    const { canvas, surface, setup, tick, gl, frames } = harness({ speed: 0 });
    const running = startCanvas(canvas, setup);
    tick();
    tick();
    expect(frames.pending()).toBe(false);
    frames.slow(40);
    for (let index = 0; index < 12 && !frames.pending(); index += 1) {
      running.invalidate();
      tick();
    }
    expect(frames.pending()).toBe(true);
    expect(gl.pixelRatio()).toBe(1);
    const before = gl.calls.length;
    frames.slow(0);
    tick();
    expect(gl.pixelRatio()).toBeCloseTo(0.85);
    expect(gl.calls.length).toBeGreaterThan(before);
    expect(surface.isDrawn('fan')).toBe(true);
    running.dispose();
  });

  it('asks for a fresh surface when the context is restored', () => {
    const { canvas, setup, restored } = harness();
    const running = startCanvas(canvas, setup);
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(restored()).toBe(1);
    running.dispose();
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(restored()).toBe(1);
  });
});
