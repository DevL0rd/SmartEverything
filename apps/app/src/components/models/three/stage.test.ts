import { Scene, Texture, WebGLRenderTarget } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { describe, expect, it, vi, type Mock } from 'vitest';
import {
  createStage,
  createStageScene,
  ENVIRONMENT_BLUR,
  kelvinRgb,
  releaseStageEnvironment,
  STAGE_RIGS,
  stageEnvironment,
  viewDirection,
  type EnvironmentBaker,
} from './stage';

function fakeBaker(): EnvironmentBaker & {
  readonly target: WebGLRenderTarget;
  readonly fromScene: Mock<EnvironmentBaker['fromScene']>;
  readonly dispose: Mock<() => void>;
} {
  const target = new WebGLRenderTarget(4, 4);
  return {
    target,
    fromScene: vi.fn<EnvironmentBaker['fromScene']>(() => target),
    dispose: vi.fn<() => void>(),
  };
}

describe('stage rig', () => {
  it('keeps one rig with the section 3 values for both themes', () => {
    expect(STAGE_RIGS.light.shadowOpacity).toBe(0.35);
    expect(STAGE_RIGS.dark.shadowOpacity).toBe(0.55);
    expect(STAGE_RIGS.dark.rim.intensity).toBeGreaterThan(STAGE_RIGS.light.rim.intensity);
    for (const rig of Object.values(STAGE_RIGS)) {
      expect(rig.key.kelvin).toBe(5200);
      expect(rig.rim.kelvin).toBeGreaterThan(rig.key.kelvin);
      expect(rig.environment).toBeLessThan(0.5);
    }
  });

  it('turns colour temperature into a warm key and a cool rim', () => {
    const [kr, , kb] = kelvinRgb(5200);
    const [rr, , rb] = kelvinRgb(9000);
    expect(kr).toBe(255);
    expect(kb).toBeLessThan(kr);
    expect(rb).toBe(255);
    expect(rr).toBeLessThan(rb);
  });

  it('places the key top-left front and the rim back-right of the camera', () => {
    const stage = createStage('light');
    expect(stage.key.position.x).toBeLessThan(0);
    expect(stage.key.position.y).toBeGreaterThan(0);
    expect(stage.key.position.z).toBeGreaterThan(0);
    expect(stage.rim.position.x).toBeGreaterThan(0);
    expect(stage.rim.position.z).toBeLessThan(0);
    expect(stage.key.castShadow).toBe(false);
    expect(stage.rim.castShadow).toBe(false);
  });

  it('turns the rig with the camera yaw', () => {
    const turned = viewDirection([0, 0, 1], 90);
    expect(turned.x).toBeCloseTo(1);
    expect(turned.z).toBeCloseTo(0);
    const stage = createStage('dark', 0);
    const front = stage.key.position.clone();
    stage.face(30);
    expect(stage.key.position.angleTo(front)).toBeGreaterThan(0.1);
    expect(stage.key.position.length()).toBeCloseTo(front.length());
  });

  it('switches theme in place', () => {
    const stage = createStage('light');
    stage.setTheme('dark');
    expect(stage.theme()).toBe('dark');
    expect(stage.rim.intensity).toBe(STAGE_RIGS.dark.rim.intensity);
    expect(stage.fill.intensity).toBe(STAGE_RIGS.dark.fill.intensity);
  });
});

describe('stage environment', () => {
  it('bakes the procedural room once per owner and frees the baker', () => {
    const owner = {};
    const baker = fakeBaker();
    const bake = vi.fn<() => EnvironmentBaker>(() => baker);
    const first = stageEnvironment(owner, bake);
    const second = stageEnvironment(owner, bake);
    expect(first).toBe(baker.target.texture);
    expect(second).toBe(first);
    expect(bake).toHaveBeenCalledTimes(1);
    expect(baker.fromScene).toHaveBeenCalledWith(expect.any(RoomEnvironment), ENVIRONMENT_BLUR);
    expect(baker.dispose).toHaveBeenCalledTimes(1);
    releaseStageEnvironment(owner);
    stageEnvironment(owner, bake);
    expect(bake).toHaveBeenCalledTimes(2);
  });

  it('dresses a transparent scene with the environment and the rig', () => {
    const environment = new Texture();
    const dressed = createStageScene('light', environment, 30);
    expect(dressed.scene).toBeInstanceOf(Scene);
    expect(dressed.scene.environment).toBe(environment);
    expect(dressed.scene.background).toBeNull();
    expect(dressed.scene.environmentIntensity).toBe(STAGE_RIGS.light.environment);
    expect(dressed.stage.lights.parent).toBe(dressed.scene);
    dressed.setTheme('dark');
    expect(dressed.scene.environmentIntensity).toBe(STAGE_RIGS.dark.environment);
    dressed.dispose();
    expect(dressed.stage.lights.parent).toBeNull();
  });
});
