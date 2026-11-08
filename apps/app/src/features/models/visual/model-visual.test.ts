import { describe, expect, it } from 'vitest';
import { BAKE_VERSION } from '../../../components/models/three/bake-version';
import type { BakeOutcome } from '../bake/bake-queue';
import {
  bakeKeys,
  chooseFace,
  clipRate,
  faceMoves,
  faceSignals,
  isFunctioning,
  shotSignals,
  stillState,
  type ModelLook,
} from './model-visual';
import { bakeLayer, clipImage, fanSpec, layersImage } from './visual-fixture';

const SPEC = fanSpec();

const LOOK: ModelLook = {
  source: { spec: SPEC, specHash: 'spec1', tokenHash: 'tok1', finish: null, params: {} },
  view: 'card',
  px: 96,
  dpr: 3,
  theme: 'dark',
};

function baked(image: ReturnType<typeof clipImage> | ReturnType<typeof layersImage>): BakeOutcome {
  const key = bakeKeys(LOOK, { power: true, speed: 0.5 }).still;
  if (key === null) throw new Error('no key');
  return { kind: 'baked', bake: { keyText: 'k', key, image } };
}

describe('model visual bake choice', () => {
  it('bakes the state that matches the live signals, else one with the same shot, else the first', () => {
    expect(stillState(SPEC, { power: false, speed: 0 })).toBe('off');
    expect(stillState(SPEC, { power: true, speed: 0.5 })).toBe('on');
    expect(stillState(SPEC, { power: true, speed: 0.9 })).toBe('on');
    expect(stillState(SPEC, { power: true, speed: 0 })).toBe('off');
  });

  it('asks for a still always and for the shot clip only while the device functions', () => {
    const working = bakeKeys(LOOK, { power: true, speed: 0.9 });
    expect(working.still).toMatchObject({
      specHash: 'spec1',
      bakeVersion: BAKE_VERSION,
      tokenHash: 'tok1',
      width: 96,
      height: 96,
      dpr: 3,
      theme: 'dark',
      target: { kind: 'keyframe', state: 'on' },
    });
    expect(working.clip?.target).toEqual({ kind: 'shot', shotId: 'blades' });
    expect(bakeKeys(LOOK, { power: false, speed: 0 }).clip).toBeNull();
  });

  it('counts a device as functioning only while a shot or a moving channel is active', () => {
    expect(isFunctioning(SPEC, { power: true, speed: 0, brightness: 80 })).toBe(false);
    expect(isFunctioning(SPEC, { power: true, speed: 0.3 })).toBe(true);
  });

  it('prefers the clip, then the layered still, and stays empty until a bake lands', () => {
    const clip = clipImage({});
    const still = layersImage([bakeLayer({})]);
    expect(chooseFace(baked(still), baked(clip))).toEqual({ kind: 'clip', clip });
    expect(chooseFace(baked(still), null)).toEqual({ kind: 'layers', image: still });
    const lost: BakeOutcome = { kind: 'failed', reason: 'webgl', detail: 'none' };
    expect(chooseFace(lost, lost)).toEqual({ kind: 'empty' });
    expect(chooseFace(null, null)).toEqual({ kind: 'empty' });
  });

  it('plays the clip at the live speed relative to the speed it was baked at', () => {
    expect(shotSignals(SPEC, 'blades')).toEqual({ power: true, speed: 0.5 });
    const face = { kind: 'clip', clip: clipImage({}) } as const;
    const signals = faceSignals(SPEC, face, { power: true, speed: 1 });
    expect(clipRate(SPEC, signals)).toBeCloseTo(2);
    expect(faceMoves(SPEC, 'card', face, signals)).toBe(true);
  });

  it('keeps an idle layered still at zero frames', () => {
    const face = { kind: 'layers', image: layersImage([bakeLayer({})]) } as const;
    const signals = faceSignals(SPEC, face, { power: false, speed: 0 });
    expect(signals.baked).toEqual({ power: false, speed: 0 });
    expect(faceMoves(SPEC, 'card', face, signals)).toBe(false);
  });
});
