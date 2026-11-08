import { describe, expect, it } from 'vitest';
import { createVisibilityRegistry } from '../../../components/house-map/live-visibility/registry';
import { fanSpec } from '../visual/visual-fixture';
import { LiveSurface, type LiveViewInput } from './live-surface';
import { LiveViewSet } from './visible-set';
import { PaintAcknowledgement, RoutePaint } from './route-paint';

const INPUT: LiveViewInput = {
  spec: fanSpec(),
  model: { specHash: 'fan', lod: 0, finish: null, params: {} },
  view: 'tile',
  theme: 'dark',
  signals: { speed: 0.5 },
  reduced: false,
  functioning: true,
};

function surface(): LiveSurface {
  return new LiveSurface(new LiveViewSet(createVisibilityRegistry()));
}

describe('live surface', () => {
  it('lists only live views with their inputs', () => {
    const live = surface();
    live.join('a', INPUT);
    live.join('b', INPUT);
    live.set.report('a', { onScreen: true, screenFocused: true });
    expect(live.live().map((view) => view.id)).toEqual(['a']);
    live.update('a', { ...INPUT, functioning: false });
    expect(live.live()).toEqual([]);
  });

  it('fences the previous page even while its delayed blur has not reported', () => {
    const live = surface();
    const paint = new RoutePaint();
    live.join('diffuser', { ...INPUT, routeKey: 'devices' });
    live.join('fan', { ...INPUT, routeKey: 'home' });
    for (const id of ['diffuser', 'fan']) {
      live.set.report(id, { onScreen: true, screenFocused: true });
    }

    paint.select('devices');
    const oldFrame = paint.generation;
    expect(live.live(paint.route).map((view) => view.id)).toEqual(['diffuser']);

    expect(paint.select('home')).toBe(true);
    expect(paint.accepts(oldFrame)).toBe(false);
    expect(live.live(paint.route).map((view) => view.id)).toEqual(['fan']);
    const homeFrame = paint.generation;
    expect(paint.select('home')).toBe(false);
    expect(paint.accepts(homeFrame)).toBe(true);

    paint.select('devices');
    expect(paint.accepts(oldFrame)).toBe(false);
    paint.invalidate();
    expect(paint.accepts(homeFrame)).toBe(false);
  });

  it('acknowledges a same-route model that leaves and returns before the next draw', () => {
    const live = surface();
    const paint = new PaintAcknowledgement();
    live.join('fan', { ...INPUT, routeKey: 'devices' });
    const sync = (): void => {
      paint.sync(
        1,
        live.live('devices').map((view) => view.id),
      );
    };
    const shown = { onScreen: true, screenFocused: true };
    live.set.report('fan', shown);
    sync();
    expect(paint.acknowledge(['fan'])).toBe(true);
    live.frameDrawn(['fan']);
    expect(paint.acknowledge(['fan'])).toBe(false);

    live.set.report('fan', { onScreen: false });
    sync();
    live.set.report('fan', shown);
    sync();
    expect(live.isDrawn('fan')).toBe(false);
    expect(paint.acknowledge(['fan'])).toBe(true);
    live.frameDrawn(['fan']);
    expect(live.isDrawn('fan')).toBe(true);

    sync();
    expect(paint.acknowledge(['fan'])).toBe(false);
    paint.sync(2, ['fan']);
    expect(paint.acknowledge(['fan'])).toBe(true);
  });

  it('marks the first drawn frame and forgets it when the view stops being live', () => {
    const live = surface();
    live.join('a', INPUT);
    live.frameDrawn(['a']);
    expect(live.isDrawn('a')).toBe(false);
    live.set.report('a', { onScreen: true, screenFocused: true });
    let heard = 0;
    live.subscribeDrawn('a', () => {
      heard += 1;
    });
    live.frameDrawn(['a']);
    live.frameDrawn(['a']);
    expect(live.isDrawn('a')).toBe(true);
    live.set.report('a', { onScreen: false });
    expect(live.isDrawn('a')).toBe(false);
    expect(heard).toBe(2);
  });

  it('forgets a drawn view as soon as a frame no longer draws it', () => {
    const live = surface();
    live.join('a', INPUT);
    live.set.report('a', { onScreen: true, screenFocused: true });
    live.frameDrawn(['a']);
    expect(live.isDrawn('a')).toBe(true);
    live.frameDrawn([]);
    expect(live.isDrawn('a')).toBe(false);
    live.frameDrawn(['a']);
    expect(live.isDrawn('a')).toBe(true);
  });
});
