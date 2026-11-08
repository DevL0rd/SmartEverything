import {
  MODEL_SPEC_CHANNEL,
  MODEL_SPEC_SHOT,
  type ModelSpecChannel,
  type ModelSpecShot,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  AFFINE_TOLERANCE_RAD,
  CLIP_FRAMES,
  type ChannelMode,
  classifyChannel,
  clipFrameCount,
  planClip,
  planImpostor,
} from './impostor-plan';

type Property = ModelSpecChannel['property'];

const FRONT = { yaw: 0, pitch: 0 };
const HOUSE = { yaw: 30, pitch: 18 };

function mode(property: Property, axis: 'x' | 'y' | 'z' | undefined, camera = FRONT): ChannelMode {
  return classifyChannel({ property, axis }, camera);
}

function shot(overrides: Record<string, unknown>): ModelSpecShot {
  return MODEL_SPEC_SHOT.parse({
    id: 'spinning',
    when: { anyOf: [{ allOf: [{ signal: 'power', op: 'eq', value: true }] }] },
    focus: 'blades',
    zoom: 2,
    yaw: 10,
    pitch: 5,
    easeMs: 400,
    loopS: 1,
    symmetry: 72,
    stillAt: 0.25,
    ...overrides,
  });
}

describe('channel classification', () => {
  it('keeps tint and opacity channels affine at any camera', () => {
    for (const property of ['opacity', 'visible', 'emissive', 'colour'] as const) {
      expect(mode(property, undefined, HOUSE)).toBe('affine');
    }
  });

  it('rotates affinely only about the view axis within the distortion tolerance', () => {
    expect(mode('rotate', 'z')).toBe('affine');
    expect(mode('rotate', 'z', HOUSE)).toBe('atlas');
    expect(mode('rotate', 'y', HOUSE)).toBe('atlas');
    expect(mode('rotate', 'y', { yaw: 0, pitch: 90 })).toBe('affine');
    const edge = (AFFINE_TOLERANCE_RAD * 180) / Math.PI;
    expect(mode('rotate', 'z', { yaw: edge - 0.5, pitch: 0 })).toBe('affine');
    expect(mode('rotate', 'z', { yaw: edge + 0.5, pitch: 0 })).toBe('atlas');
  });

  it('translates affinely unless the motion runs along the view axis', () => {
    expect(mode('translate', 'x')).toBe('affine');
    expect(mode('translate', 'y', HOUSE)).toBe('affine');
    expect(mode('translate', 'z')).toBe('atlas');
  });

  it('scales uniformly or along an axis that lies in the screen', () => {
    expect(mode('scale', undefined, HOUSE)).toBe('affine');
    expect(mode('scale', 'x')).toBe('affine');
    expect(mode('scale', 'x', HOUSE)).toBe('atlas');
    expect(mode('scale', 'z')).toBe('atlas');
  });

  it('sends texture scrolls and pose picks to the atlas', () => {
    expect(mode('uvScroll', 'x')).toBe('atlas');
    expect(mode('pose', undefined)).toBe('atlas');
  });
});

describe('clip frame counts', () => {
  it('uses 24, 36 and 48 frames without symmetry', () => {
    expect(clipFrameCount('tile', 360)).toBe(24);
    expect(clipFrameCount('card', 360)).toBe(36);
    expect(clipFrameCount('hero', 360)).toBe(48);
    expect(clipFrameCount('hero', 720)).toBe(CLIP_FRAMES.hero);
  });

  it('shrinks with the rotational symmetry of the moving part', () => {
    expect(clipFrameCount('tile', 72)).toBe(5);
    expect(clipFrameCount('card', 72)).toBe(8);
    expect(clipFrameCount('hero', 72)).toBe(10);
    expect(clipFrameCount('tile', 180)).toBe(12);
    expect(clipFrameCount('tile', 0.1)).toBe(1);
  });

  it('plans one clip per shot with the still frame inside the symmetry period', () => {
    const clip = planClip('card', shot({}));
    expect(clip).toEqual({
      shotId: 'spinning',
      frames: 8,
      loopS: 1,
      periodS: 0.2,
      stillAt: 0.25,
      stillFrame: 2,
    });
    expect(planClip('tile', shot({ stillAt: 0, symmetry: 360 })).stillFrame).toBe(0);
    expect(planClip('tile', shot({ stillAt: 1, symmetry: 360 })).stillFrame).toBe(0);
    expect(planClip('tile', shot({ stillAt: 0.95, symmetry: 360 })).stillFrame).toBe(23);
  });
});

describe('impostor plan', () => {
  const view = { yaw: 30, pitch: 18, fov: 28, padding: 0.1 };
  const framing = { tile: view, card: view, hero: { ...view, yaw: 0, pitch: 0 } };
  const base = {
    target: 'blades',
    source: 'speed',
    map: { type: 'speed', in: [0, 1], perSecond: [0, 3] },
    motion: { type: 'spin' },
    reduced: 'hold',
  };
  const channels = [
    MODEL_SPEC_CHANNEL.parse({ ...base, id: 'glow', property: 'emissive' }),
    MODEL_SPEC_CHANNEL.parse({ ...base, id: 'blades', property: 'rotate', axis: 'z' }),
  ];

  it('classifies every channel at the chosen view and plans a clip per shot', () => {
    const tile = planImpostor({ framing, channels, shots: [shot({})] }, 'tile');
    expect(tile.channels).toEqual([
      { id: 'glow', mode: 'affine' },
      { id: 'blades', mode: 'atlas' },
    ]);
    expect(tile.clips.map((clip) => clip.frames)).toEqual([5]);
    expect(tile.atlasWithoutShot).toEqual([]);
    const hero = planImpostor({ framing, channels, shots: [shot({})] }, 'hero');
    expect(hero.channels.map((c) => c.mode)).toEqual(['affine', 'affine']);
    expect(hero.clips.map((clip) => clip.frames)).toEqual([10]);
  });

  it('reports atlas channels that no shot covers', () => {
    const plan = planImpostor({ framing, channels }, 'card');
    expect(plan.clips).toEqual([]);
    expect(plan.atlasWithoutShot).toEqual(['blades']);
    expect(planImpostor({ framing }, 'card')).toEqual({
      view: 'card',
      channels: [],
      clips: [],
      atlasWithoutShot: [],
    });
  });
});
