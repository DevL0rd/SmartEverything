import { describe, expect, it } from 'vitest';
import type { VisualState } from '../../../features/device-visuals/types';
import { ORALB_PROFILE_FIXTURE, frameOf, oralbFrameOf, oralbViewOf, viewOf } from './fixtures';
import { brushVisualState } from './live-visual';
import { isBrushing, needsRefresh, newerFrame } from './live-frame';

const BASE: VisualState = {
  power: 'off',
  online: true,
  level: 0,
  band: null,
  target: null,
  targetShare: null,
  current: null,
  oscillating: false,
  angle: null,
  colour: null,
  ambientLight: null,
  waterLow: false,
  waterLevel: null,
  thermal: 'idle',
  locked: null,
  position: null,
  progress: null,
  battery: null,
  pulse: null,
  syncing: false,
  load: null,
  reading: null,
  source: null,
  presence: null,
  open: null,
};

describe('the illustration of the brush', () => {
  it('wakes the illustration while the brush is brushing, awake or paused', () => {
    for (const activity of ['brushing', 'paused', 'standby'] as const) {
      const state = brushVisualState(BASE, frameOf({ activity }), viewOf());
      expect(state.power).toBe('on');
    }
    expect(brushVisualState(BASE, frameOf({ activity: 'asleep' }), viewOf()).power).toBe('off');
    expect(brushVisualState(BASE, frameOf({ activity: 'charging' }), viewOf()).power).toBe('off');
  });

  it('draws the live frame over what was loaded', () => {
    const state = brushVisualState(
      BASE,
      frameOf({
        activity: 'brushing',
        mode: 'gum_health',
        intensity: 'high',
        pressure: 'too_high',
        battery: 55,
      }),
      viewOf(),
    );
    expect(state.toothbrush).toMatchObject({
      activity: 'brushing',
      mode: 'gum_health',
      intensity: 'high',
      pressure: 'too_high',
      battery: 55,
      head: 'fitted',
      headType: 'clean',
      fault: false,
    });
    expect(state.toothbrush?.wear).toBeCloseTo(0.33);
  });

  it('falls back to the loaded battery when the frame has none and marks a fault', () => {
    const view = viewOf();
    const faulty = { ...view, handle: { ...view.handle, faultHex: '4:0' } };
    const state = brushVisualState(BASE, frameOf({ battery: null }), faulty);
    expect(state.toothbrush).toMatchObject({ battery: 80, fault: true });
  });

  it('draws no wear for a head the model does not report', () => {
    const state = brushVisualState(BASE, frameOf(), viewOf({ head: { wearPercent: null } }));
    expect(state.toothbrush?.wear).toBeNull();
  });
});

describe('the illustration of an Oral-B handle', () => {
  it('carries the elapsed time of the session and the display of the handle', () => {
    const state = brushVisualState(BASE, oralbFrameOf({ elapsedS: 72 }), oralbViewOf());
    expect(state.toothbrush).toMatchObject({ brand: 'oralb', elapsedS: 72, display: true });
  });

  it('knows a handle that only reports through the advert has no display', () => {
    const advert = oralbViewOf({ view: { profile: { ...ORALB_PROFILE_FIXTURE, face: 'advert' } } });
    expect(brushVisualState(BASE, oralbFrameOf(), advert).toothbrush?.display).toBe(false);
  });

  it('always has a display on a Sonicare handle', () => {
    expect(brushVisualState(BASE, frameOf(), viewOf()).toothbrush?.display).toBe(true);
  });
});

describe('live frames', () => {
  it('prefers the newer of the live and the loaded frame', () => {
    const loaded = frameOf({ at: '2026-10-18T07:30:00.000Z' });
    const live = frameOf({ at: '2026-10-18T07:30:05.000Z', elapsedS: 5 });
    expect(newerFrame(live, loaded)).toBe(live);
    expect(newerFrame(frameOf({ at: '2026-10-18T07:29:00.000Z' }), loaded)).toBe(loaded);
    expect(newerFrame(null, loaded)).toBe(loaded);
  });

  it('reloads the page data only when the state of the brush changes', () => {
    const resting = frameOf();
    expect(needsRefresh(null, resting)).toBe(true);
    expect(needsRefresh(resting, frameOf({ elapsedS: 3, battery: 70 }))).toBe(false);
    expect(needsRefresh(resting, frameOf({ activity: 'brushing' }))).toBe(true);
    expect(needsRefresh(resting, frameOf({ session: 'running' }))).toBe(true);
    expect(needsRefresh(resting, frameOf({ link: 'asleep' }))).toBe(true);
  });

  it('knows a brushing or paused brush is in use', () => {
    expect(isBrushing(frameOf({ activity: 'brushing' }))).toBe(true);
    expect(isBrushing(frameOf({ activity: 'paused' }))).toBe(true);
    expect(isBrushing(frameOf({ activity: 'standby' }))).toBe(false);
  });
});
