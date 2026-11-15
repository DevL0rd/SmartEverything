import { describe, expect, it, vi } from 'vitest';
import { canvasPixelRatio } from './render-core-renderer';
import {
  sharedPool,
  sharedSurface,
  type SurfacePaint,
  type SurfaceRenderer,
  type SurfaceTarget,
} from './render-core-surface';

interface FakeSource {
  width: number;
  height: number;
  readonly lost: (() => void)[];
  addEventListener(type: 'webglcontextlost', listener: () => void): void;
}

interface FakeRenderer extends SurfaceRenderer<FakeSource> {
  readonly setSize: ReturnType<typeof vi.fn<(width: number, height: number) => void>>;
}

function fakeRenderer(): FakeRenderer {
  const source: FakeSource = {
    width: 300,
    height: 150,
    lost: [],
    addEventListener(_type, listener): void {
      this.lost.push(listener);
    },
  };
  let ratio = 1;
  let size = { width: 300, height: 150 };
  const fit = (): void => {
    source.width = Math.floor(size.width * ratio);
    source.height = Math.floor(size.height * ratio);
  };
  return {
    domElement: source,
    getPixelRatio: () => ratio,
    setPixelRatio(value): void {
      ratio = value;
      fit();
    },
    setSize: vi.fn((width: number, height: number): void => {
      size = { width, height };
      fit();
    }),
  };
}

interface FakeTarget extends SurfaceTarget<FakeSource> {
  readonly paint: SurfacePaint<FakeSource> & {
    readonly drawn: FakeSource[];
  };
}

function fakeTarget(): FakeTarget {
  const drawn: FakeSource[] = [];
  const paint = {
    drawn,
    clearRect: vi.fn(),
    drawImage(image: FakeSource): void {
      drawn.push(image);
    },
  };
  return { width: 300, height: 150, paint, getContext: () => paint };
}

describe('shared small-stage renderer', () => {
  it('gives every small stage the same renderer, so programs compile once', () => {
    const create = vi.fn(fakeRenderer);
    const pool = sharedPool(create);
    const first = sharedSurface(fakeTarget(), pool);
    const second = sharedSurface(fakeTarget(), pool);
    expect(first.renderer).toBe(second.renderer);
    expect(create).toHaveBeenCalledTimes(1);
    expect(pool.users).toBe(2);
  });

  it('keeps the renderer across scroll-off and scroll-back remounts', () => {
    const create = vi.fn(fakeRenderer);
    const pool = sharedPool(create);
    const shown = sharedSurface(fakeTarget(), pool);
    const renderer = shown.renderer;
    shown.release();
    expect(pool.users).toBe(0);
    expect(renderer.setSize).toHaveBeenLastCalledWith(1, 1, false);
    expect(renderer.domElement.width).toBe(1);
    for (let mount = 0; mount < 6; mount += 1) {
      const again = sharedSurface(fakeTarget(), pool);
      expect(again.renderer).toBe(renderer);
      again.release();
    }
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('replaces the renderer only after its context is lost', () => {
    const create = vi.fn(fakeRenderer);
    const pool = sharedPool(create);
    const first = sharedSurface(fakeTarget(), pool);
    first.renderer.domElement.lost.forEach((listener) => {
      listener();
    });
    const second = sharedSurface(fakeTarget(), pool);
    expect(second.renderer).not.toBe(first.renderer);
    expect(create).toHaveBeenCalledTimes(2);
    first.release();
    expect(pool.users).toBe(1);
  });

  it('draws each stage at its own size and copies the frame into its own canvas', () => {
    const pool = sharedPool(fakeRenderer);
    const small = fakeTarget();
    const wide = fakeTarget();
    const a = sharedSurface(small, pool);
    const b = sharedSurface(wide, pool);
    a.setPixelRatio(2, 1);
    a.resize(120, 120);
    b.setPixelRatio(2, 1);
    b.resize(200, 90);
    expect(a.frame(() => a.renderer.domElement.width)).toBe(small.width);
    expect(b.frame(() => b.renderer.domElement.height)).toBe(wide.height);
    expect(small).toMatchObject({ width: 240, height: 240 });
    expect(wide).toMatchObject({ width: 400, height: 180 });
    expect(small.paint.drawn).toEqual([a.renderer.domElement]);
    expect(wide.paint.drawn).toEqual([b.renderer.domElement]);
  });

  it('skips resizing the shared buffer when stages share a size', () => {
    const pool = sharedPool(fakeRenderer);
    const stages = [sharedSurface(fakeTarget(), pool), sharedSurface(fakeTarget(), pool)];
    stages.forEach((stage) => {
      stage.setPixelRatio(1, 1);
      stage.resize(120, 120);
    });
    const [first] = stages;
    if (first === undefined) throw new Error('no stage');
    first.frame(() => null);
    const calls = first.renderer.setSize.mock.calls.length;
    stages.forEach((stage) => {
      stage.frame(() => null);
    });
    expect(first.renderer.setSize.mock.calls.length).toBe(calls);
  });

  it('reports a pixel ratio change once', () => {
    const stage = sharedSurface(fakeTarget(), sharedPool(fakeRenderer));
    expect(stage.setPixelRatio(2, 1)).toBe(canvasPixelRatio(2, 1) !== 1);
    expect(stage.setPixelRatio(2, 1)).toBe(false);
    expect(stage.setPixelRatio(2, 0.5)).toBe(true);
  });
});
