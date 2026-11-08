import { SplatEdit } from '@sparkjsdev/spark';
import {
  CustomBlending,
  Mesh,
  PerspectiveCamera,
  PointLight,
  Scene,
  ShaderMaterial,
  SrcColorFactor,
  ZeroFactor,
  type Camera,
  type Object3D,
  type WebGLRenderTarget,
} from 'three';
import { describe, expect, it } from 'vitest';
import { DAYLIGHT, DUSK, floorLighting } from '../../lighting';
import { floorOf, input, ON, placement } from '../../lighting-fixture';
import { DEFAULT_QUALITY_CONFIG, FULL_QUALITY } from '../../live-visibility/quality-scaler';
import {
  duskBackground,
  Relight,
  relightQuality,
  type RelightInput,
  type RelightRenderer,
} from './relight';

interface Drawn {
  readonly scene: Object3D;
  readonly target: WebGLRenderTarget | null;
}

function fakeRenderer(): RelightRenderer & { readonly drawn: Drawn[] } {
  let target: WebGLRenderTarget | null = null;
  const drawn: Drawn[] = [];
  return {
    drawn,
    shadowMap: { enabled: false },
    autoClear: true,
    getPixelRatio: () => 2,
    getRenderTarget: () => target,
    setRenderTarget: (next): void => {
      target = next;
    },
    render: (scene): void => {
      drawn.push({ scene, target });
    },
  };
}

const lamps = [placement('a', 2, 2), placement('b', 6, 2, { mount: 'floor', height: 1.2 })];

function relightInput(enabled: boolean, quality = FULL_QUALITY): RelightInput {
  return {
    sceneKey: 'scene-1',
    floor: floorOf(lamps),
    lighting: floorLighting(input(lamps, { a: ON, b: ON }, enabled)),
    quality,
  };
}

function camera(x: number): Camera {
  const view = new PerspectiveCamera(50, 1.5, 0.1, 100);
  view.position.set(x, 8, 8);
  view.lookAt(4, 0, -2);
  view.updateMatrixWorld(true);
  return view;
}

const pointLights = (scene: Object3D): number => {
  let count = 0;
  scene.traverse((object) => {
    if (object instanceof PointLight) count += 1;
  });
  return count;
};

const glowSpheres = (relight: Relight): number =>
  relight.edits.children.reduce(
    (sum, child) => sum + (child instanceof SplatEdit ? (child.sdfs?.length ?? 0) : 0),
    0,
  );

describe('Relight', () => {
  it('composes nothing while it is not active', () => {
    const renderer = fakeRenderer();
    const relight = new Relight(renderer);
    relight.update(relightInput(true));

    expect(relight.compose(camera(4), 600, 400)).toBe(false);
    expect(renderer.drawn).toHaveLength(0);
  });

  it('lights on: renders the light buffers once per change and composites every frame', () => {
    const renderer = fakeRenderer();
    const relight = new Relight(renderer);
    relight.update(relightInput(true));
    relight.setActive(true);

    relight.compose(camera(4), 600, 400);
    relight.compose(camera(4), 600, 400);
    expect(relight.counts()).toEqual({ bufferRenders: 1, composites: 2 });

    relight.compose(camera(5), 600, 400);
    expect(relight.counts()).toEqual({ bufferRenders: 2, composites: 3 });

    const lightScene = renderer.drawn[0]?.scene;
    expect(lightScene).toBeDefined();
    if (lightScene === undefined) return;
    expect(pointLights(lightScene)).toBe(2);
    expect(glowSpheres(relight)).toBe(2);
    expect(renderer.drawn[0]?.target).not.toBeNull();
    expect(renderer.drawn[2]?.target).toBeNull();
    expect(renderer.autoClear).toBe(true);
  });

  it('lights off: no proxy lights, no glow and the dusk lifts', () => {
    const renderer = fakeRenderer();
    const relight = new Relight(renderer);
    relight.update(relightInput(true));
    relight.setActive(true);
    relight.compose(camera(4), 600, 400);

    expect(relight.update(relightInput(false))).toBe(true);
    relight.compose(camera(4), 600, 400);
    const lightScene = renderer.drawn.at(-3)?.scene;
    expect(lightScene).toBeDefined();
    if (lightScene === undefined) return;
    expect(pointLights(lightScene)).toBe(0);
    expect(glowSpheres(relight)).toBe(0);
    expect(lightScene instanceof Scene && lightScene.background).toEqual(duskBackground(DAYLIGHT));
    expect(duskBackground(DUSK).r).toBeLessThan(duskBackground(DAYLIGHT).r);
  });

  it('does not re-render when nothing changed', () => {
    const renderer = fakeRenderer();
    const relight = new Relight(renderer);
    relight.update(relightInput(true));

    expect(relight.update(relightInput(true))).toBe(false);
  });

  it('multiplies the scan by the light buffer', () => {
    const renderer = fakeRenderer();
    const probe = new Relight(renderer);
    probe.setActive(true);
    probe.update(relightInput(true));
    probe.compose(camera(4), 600, 400);
    const composite = renderer.drawn.at(-1)?.scene;
    const multiply = composite?.children.find((child) => child.name === 'relight-multiply');

    expect(multiply instanceof Mesh && multiply.material instanceof ShaderMaterial).toBe(true);
    if (!(multiply instanceof Mesh) || !(multiply.material instanceof ShaderMaterial)) return;
    expect(multiply.material.blending).toBe(CustomBlending);
    expect(multiply.material.blendSrc).toBe(ZeroFactor);
    expect(multiply.material.blendDst).toBe(SrcColorFactor);
    probe.dispose();
  });
});

describe('relightQuality', () => {
  const [scale = 1] = DEFAULT_QUALITY_CONFIG.phases.renderScale;
  const [splat = 1] = DEFAULT_QUALITY_CONFIG.phases.splatScale;

  it('leaves the buffer resolution to the canvas pixel ratio, then turns static shadows off', () => {
    expect(relightQuality(FULL_QUALITY)).toEqual({ shadows: true });
    expect(relightQuality({ ...FULL_QUALITY, renderScale: scale })).toEqual({ shadows: true });
    expect(relightQuality({ ...FULL_QUALITY, renderScale: scale, splatScale: splat }).shadows).toBe(
      false,
    );
  });
});
