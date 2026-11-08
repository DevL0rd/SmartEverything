import { Texture } from 'three';
import { describe, expect, it } from 'vitest';
import { fanSpec } from '../visual/visual-fixture';
import {
  createLiveRenderer,
  intersect,
  syncLive,
  type LiveRenderer,
  type LiveViewModel,
} from './renderer-core';
import { fakeGl, type FakeGl } from './renderer-fixture';

const spec = fanSpec();

function view(id: string, overrides: Partial<LiveViewModel> = {}): LiveViewModel {
  return {
    id,
    spec,
    model: { specHash: 'fan', lod: 0, finish: null, params: {} },
    view: 'tile',
    theme: 'dark',
    signals: { speed: 0.5 },
    reduced: false,
    ...overrides,
  };
}

interface Setup {
  readonly fake: FakeGl;
  readonly renderer: LiveRenderer;
  readonly views: LiveViewModel[];
}

function setup(count: number): Setup {
  const fake = fakeGl();
  const renderer = createLiveRenderer(fake.gl, new Texture());
  renderer.resize(400, 4000, 2);
  const views = Array.from({ length: count }, (_, index) => view(`w${String(index)}`));
  syncLive(renderer, views);
  views.forEach((each, index) => {
    const rect = { x: 0, y: index * 90, width: 80, height: 80 };
    renderer.place(each.id, rect, rect);
  });
  return { fake, renderer, views };
}

describe('shared live renderer', () => {
  it.each([1, 8, 40])('draws all %i visible functioning widgets every frame', (count) => {
    const { fake, renderer } = setup(count);
    const frame = renderer.draw(1000);
    expect(frame.drawn).toHaveLength(count);
    expect(frame.moving).toBe(true);
    expect(fake.calls).toHaveLength(count);
    expect(renderer.cache.hashes()).toHaveLength(1);
    expect(new Set(fake.calls.map((call) => call.scene)).size).toBe(1);
  });

  it('gives each widget its own viewport and camera', () => {
    const { fake, renderer } = setup(2);
    renderer.draw(0);
    const [first, second] = fake.calls;
    expect(first?.viewport).toEqual([0, 4000 - 80, 80, 80]);
    expect(second?.viewport).toEqual([0, 4000 - 170, 80, 80]);
    expect(first?.camera).not.toBe(second?.camera);
  });

  it('skips views that have no rect or lie outside the surface', () => {
    const { fake, renderer } = setup(1);
    syncLive(renderer, [view('w0'), view('unplaced')]);
    renderer.place(
      'w0',
      { x: 500, y: 0, width: 80, height: 80 },
      { x: 0, y: 0, width: 1e4, height: 1e4 },
    );
    expect(renderer.draw(0).drawn).toEqual([]);
    expect(fake.calls).toEqual([]);
  });

  it('holds the final pose with reduced motion and asks for no more frames', () => {
    const { renderer } = setup(0);
    syncLive(renderer, [view('w0', { reduced: true })]);
    const rect = { x: 0, y: 0, width: 80, height: 80 };
    renderer.place('w0', rect, rect);
    expect(renderer.draw(0)).toEqual({ moving: false, drawn: ['w0'] });
  });

  it('disposes model buffers once no visible view uses a hash', () => {
    const { renderer } = setup(3);
    expect(renderer.cache.hashes()).toHaveLength(1);
    syncLive(renderer, []);
    expect(renderer.viewIds()).toEqual([]);
    expect(renderer.cache.hashes()).toEqual([]);
  });

  it('leaves exactly one scene group with one model when a view is re-synced under a new key', () => {
    const { fake, renderer } = setup(1);
    renderer.draw(0);
    const first = fake.calls[0]?.scene;
    for (const theme of ['light', 'dark', 'light'] as const) {
      syncLive(renderer, [
        view('w0', { theme, model: { specHash: 'fan', lod: 1, finish: null, params: {} } }),
      ]);
    }
    fake.calls.length = 0;
    expect(renderer.draw(1).drawn).toEqual(['w0']);
    const scenes = new Set(fake.calls.map((call) => call.scene));
    expect(scenes.size).toBe(1);
    const [scene] = [...scenes];
    expect(scene).not.toBe(first);
    expect(scene?.children.filter((child) => child.name === spec.id)).toHaveLength(1);
    expect(first?.children.filter((child) => child.name === spec.id)).toHaveLength(0);
    expect(renderer.cache.hashes()).toHaveLength(1);
  });

  it('lowers the render scale through the shared quality scaler when frames run long', () => {
    const { fake, renderer } = setup(1);
    renderer.draw(0);
    const steps = Array.from({ length: 7 }, () => renderer.recordFrame(40));
    expect(steps.indexOf(true)).toBe(6);
    expect(fake.pixelRatio()).toBe(2);
    renderer.draw(16);
    expect(fake.pixelRatio()).toBeCloseTo(2 * 0.85);
  });

  it('resizes the buffer only at the start of a frame that then draws every placed view', () => {
    const { fake, renderer } = setup(3);
    renderer.draw(0);
    for (let index = 0; index < 7; index += 1) renderer.recordFrame(40);
    renderer.resize(500, 4000, 2);
    expect(fake.pixelRatio()).toBe(2);
    fake.calls.length = 0;
    const frame = renderer.draw(16);
    expect(fake.pixelRatio()).toBeCloseTo(2 * 0.85);
    expect(frame.drawn).toEqual(['w0', 'w1', 'w2']);
    expect(fake.calls).toHaveLength(3);
  });

  it('leaves the frame that resized the buffer out of the quality measure', () => {
    const { renderer } = setup(1);
    renderer.draw(0);
    renderer.recordFrame(40);
    for (let index = 0; index < 6; index += 1) renderer.recordFrame(40);
    renderer.draw(16);
    const steps = Array.from({ length: 7 }, () => renderer.recordFrame(40));
    expect(steps.indexOf(true)).toBe(6);
  });

  it('intersects rectangles', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    expect(intersect(a, { x: 5, y: 5, width: 10, height: 10 })).toEqual({
      x: 5,
      y: 5,
      width: 5,
      height: 5,
    });
    expect(intersect(a, { x: 20, y: 0, width: 1, height: 1 })).toBeNull();
  });
});
