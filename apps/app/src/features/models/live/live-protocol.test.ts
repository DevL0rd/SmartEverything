import type { ModelSpec } from '@smarteverything/domain';
import { Texture } from 'three';
import { describe, expect, it } from 'vitest';
import { fanSpec } from '../visual/visual-fixture';
import {
  LIVE_PLACE,
  LIVE_SYNC,
  activeSpecKeys,
  placementOf,
  readSync,
  specKeyOf,
  wireSync,
} from './live-protocol';
import { createLiveRenderer, syncLive, type LiveViewModel } from './renderer-core';
import { fakeGl } from './renderer-fixture';

const live: LiveViewModel = {
  id: 'fan',
  spec: fanSpec(),
  model: { specHash: 'fan', lod: 1, finish: null, params: {} },
  view: 'card',
  theme: 'light',
  signals: { speed: 0.5, missing: undefined },
  reduced: false,
};

describe('live overlay protocol', () => {
  it('round trips views and sends each spec once', () => {
    const first = LIVE_SYNC.parse(JSON.parse(JSON.stringify(wireSync(4, [live], new Set()))));
    expect(first.generation).toBe(4);
    expect(Object.keys(first.specs)).toEqual([specKeyOf(live)]);
    const known = new Map<string, ModelSpec>();
    const [view] = readSync(first, known);
    expect(view).toMatchObject({ id: 'fan', view: 'card', signals: { speed: 0.5 } });
    const again = wireSync(4, [live], new Set([specKeyOf(live)]));
    expect(again.specs).toEqual({});
    expect(readSync(LIVE_SYNC.parse(again), known)).toHaveLength(1);
  });

  it('drops views whose spec never arrived', () => {
    const sync = wireSync(4, [live], new Set([specKeyOf(live)]));
    expect(readSync(LIVE_SYNC.parse(sync), new Map())).toEqual([]);
  });

  it('releases recycled specs and resends them when the view comes back', () => {
    const known = new Map<string, ModelSpec>();
    readSync(wireSync(4, [live], new Set()), known);
    expect(known.size).toBe(1);
    readSync(wireSync(4, [], activeSpecKeys([live])), known);
    expect(known.size).toBe(0);
    const returning = wireSync(4, [live], activeSpecKeys([]));
    expect(readSync(returning, known)).toHaveLength(1);
    expect(known.size).toBe(1);
  });

  it('clips a view to the visible part of its scroll container', () => {
    const placement = placementOf([10, 40, 80, 80, 0, 100, 400, 600]);
    expect(placement).toEqual({
      rect: { x: 10, y: 40, width: 80, height: 80 },
      clip: { x: 0, y: 100, width: 400, height: 600 },
    });
    const wire = { width: 400, height: 800, dpr: 1, placements: { fan: placement } };
    const place = LIVE_PLACE.parse(JSON.parse(JSON.stringify(wire)));
    const fake = fakeGl();
    const renderer = createLiveRenderer(fake.gl, new Texture());
    renderer.resize(place.width, place.height, place.dpr);
    syncLive(renderer, [live]);
    for (const [id, { rect, clip }] of Object.entries(place.placements)) {
      renderer.place(id, rect, clip);
    }
    expect(renderer.draw(0).drawn).toEqual(['fan']);
    expect(fake.scissor()).toEqual([10, 680, 80, 20]);
  });

  it('draws nothing of a view scrolled fully out of its container', () => {
    const fake = fakeGl();
    const renderer = createLiveRenderer(fake.gl, new Texture());
    renderer.resize(400, 800, 1);
    syncLive(renderer, [live]);
    const { rect, clip } = placementOf([10, 0, 80, 80, 0, 100, 400, 600]);
    renderer.place('fan', rect, clip);
    expect(renderer.draw(0).drawn).toEqual([]);
    expect(fake.calls).toEqual([]);
  });

  it('keeps a view without a scroll container clipped to itself', () => {
    expect(placementOf([10, 40, 80, 80])).toEqual({
      rect: { x: 10, y: 40, width: 80, height: 80 },
      clip: { x: 10, y: 40, width: 80, height: 80 },
    });
  });
});
