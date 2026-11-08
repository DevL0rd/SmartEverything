import type { ModelSpec, ModelSpecChannel } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  layerBox,
  layerMotions,
  layerMoves,
  layerPose,
  layerTint,
  pixelsPerMetre,
  screenShift,
  screenTurn,
  stackMoves,
  stackOrder,
  stackPlan,
} from './layer';
import { bakeLayer, fanSpec, layersImage } from './visual-fixture';

const SPEC = fanSpec();

const BLADES = bakeLayer({
  id: 'blades',
  role: 'part',
  channels: ['spin'],
  pivot: { x: 25, y: 30 },
});

const GLOW = bakeLayer({ id: 'emissive', role: 'emissive' });

const ON = { power: true, speed: 0.5 };

const AT = { view: 'card', frame: { width: 96, height: 96 } } as const;

function sliderSpec(axis: 'x' | 'y'): ModelSpec {
  const slide: ModelSpecChannel = {
    id: 'slide',
    target: 'blades',
    property: 'translate',
    axis,
    source: 'level',
    map: { type: 'linear', in: [0, 1], out: [0, 0.1], clamp: true },
    motion: { type: 'pose' },
    reduced: 'hold',
  };
  return { ...SPEC, channels: [...(SPEC.channels ?? []), slide] };
}

const SLIDER = bakeLayer({ id: 'blades', role: 'part', channels: ['slide'] });

describe('layer motion', () => {
  it('turns a spin about the view axis into a screen rotation relative to the baked pose', () => {
    const motions = layerMotions(SPEC, AT, BLADES, { live: { speed: 1 }, baked: ON });
    expect(motions).toHaveLength(1);
    expect(layerPose(motions, 0.2).rotate).toBeCloseTo(-144);
    expect(layerPose(motions, 0.45).rotate).toBeCloseTo(-504);
    expect(layerMoves(motions)).toBe(true);
  });

  it('holds the baked pose when the live signals equal the baked ones', () => {
    const motions = layerMotions(SPEC, AT, BLADES, { live: ON, baked: ON });
    expect(layerPose(motions, 0.2)).toEqual({
      rotate: 0,
      translateX: 0,
      translateY: 0,
      scale: 1,
      opacity: 1,
    });
  });

  it('reads the screen turn direction from the camera', () => {
    expect(screenTurn({ yaw: 0, pitch: 0 }, 'z')).toBe(-1);
    expect(screenTurn({ yaw: 180, pitch: 0 }, 'z')).toBe(1);
  });

  it('dims the emissive mask by the live brightness and tints it with the live colour', () => {
    const motions = layerMotions(SPEC, AT, GLOW, { live: { brightness: 50 }, baked: ON });
    expect(layerPose(motions, 0).opacity).toBeCloseTo(0.5);
    expect(layerTint(SPEC, { colour: '#ff8800' })).toBe('#ff8800');
    expect(layerTint(SPEC, {})).toBeNull();
  });

  it('stays still when nothing on the stack moves', () => {
    const image = layersImage([bakeLayer({}), BLADES]);
    expect(stackMoves(SPEC, 'card', image, { live: { speed: 0 }, baked: ON })).toBe(false);
    expect(stackMoves(SPEC, 'card', image, { live: { speed: 0.5 }, baked: ON })).toBe(true);
  });

  it('stacks shadow, body, parts and the emissive mask from the bottom', () => {
    const order = stackOrder([
      GLOW,
      BLADES,
      bakeLayer({ id: 'shadow', role: 'shadow' }),
      bakeLayer({}),
    ]);
    expect(order.map((layer) => layer.role)).toEqual(['shadow', 'body', 'part', 'emissive']);
  });

  it('rotates a part about its projected pivot', () => {
    expect(layerBox(BLADES).transformOrigin).toEqual([15, 10, 0]);
    expect(layerBox(bakeLayer({})).transformOrigin).toEqual([15, 20, 0]);
  });

  it('moves a translated part across the screen by its projected distance', () => {
    const scale = pixelsPerMetre(SPEC, 'card', AT.frame);
    expect(scale).toBeGreaterThan(0);
    const across = layerMotions(sliderSpec('x'), AT, SLIDER, {
      live: { level: 1 },
      baked: { level: 0 },
    });
    const pose = layerPose(across, 0);
    expect(pose.translateX).toBeCloseTo(0.1 * scale);
    expect(pose.translateY).toBeCloseTo(0);
    const up = layerMotions(sliderSpec('y'), AT, SLIDER, {
      live: { level: 1 },
      baked: { level: 0 },
    });
    expect(layerPose(up, 0).translateY).toBeCloseTo(-0.1 * scale);
    expect(screenShift(SPEC, 'card', AT.frame, 'z')[0]).toBeCloseTo(0);
  });

  it('holds a translated part where the bake drew it when the level is unchanged', () => {
    const held = layerMotions(sliderSpec('x'), AT, SLIDER, {
      live: { level: 0.5 },
      baked: { level: 0.5 },
    });
    expect(layerPose(held, 0).translateX).toBeCloseTo(0);
  });

  it('keeps the white emissive mask with its glow when no colour tints it', () => {
    const image = layersImage([bakeLayer({}), GLOW]);
    const shown = stackPlan(SPEC, 'card', image, { live: { brightness: 40 }, baked: ON });
    const glow = shown.find((each) => each.layer.role === 'emissive');
    expect(glow?.tint).toBeNull();
    expect(layerPose(glow?.motions ?? [], 0).opacity).toBeCloseTo(0.4);
  });

  it('drops an emissive mask that has neither a tint nor a glow channel', () => {
    const plain = { ...SPEC, channels: [] };
    const image = layersImage([bakeLayer({}), GLOW]);
    const shown = stackPlan(plain, 'card', image, { live: {}, baked: {} });
    expect(shown.map((each) => each.layer.role)).toEqual(['body']);
  });
});
