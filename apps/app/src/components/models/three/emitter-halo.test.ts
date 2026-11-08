import {
  AdditiveBlending,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  NotEqualStencilFunc,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Vector3,
} from 'three';
import { describe, expect, it } from 'vitest';
import {
  createEmitterHalos,
  fitHalo,
  frameRoom,
  HALO_FLOOR,
  haloDiameter,
  haloStrength,
} from './emitter-halo';
import type { SceneEmitter } from './scene-signals';
import { SILHOUETTE_STENCIL } from './silhouette';

const RADIUS = 0.05;

function camera(): PerspectiveCamera {
  const view = new PerspectiveCamera(90, 1, 0.1, 100);
  view.position.set(0, 0, 2);
  view.lookAt(0, 0, 0);
  view.updateMatrixWorld();
  return view;
}

function source(
  intensity: number,
  radius = RADIUS,
): { object3d: Object3D; emitters: SceneEmitter[] } {
  const surface = new Mesh(new PlaneGeometry(2, 2), new MeshBasicMaterial());
  const node = new Object3D();
  surface.add(node);
  const emitter: SceneEmitter = {
    id: 'light',
    node,
    cone: undefined,
    radius,
    color: '#FFD9A0',
    intensity,
    on: intensity > 0,
  };
  return { object3d: surface, emitters: [emitter] };
}

describe('emitter halo', () => {
  it('follows the level from the floor to full like the flat light', () => {
    expect(haloStrength(0)).toBe(0);
    expect(haloStrength(0.1)).toBeCloseTo(HALO_FLOOR + 0.065);
    expect(haloStrength(0.8)).toBeCloseTo(HALO_FLOOR + 0.52);
    expect(haloStrength(3)).toBe(1);
  });

  it('takes its size from the emitter glow radius, not the surface it sits on', () => {
    const dim = source(0.1);
    const halos = createEmitterHalos(dim, 'light');
    halos.sync();
    const [sprite] = halos.sprites;
    expect(sprite?.visible).toBe(true);
    expect(sprite?.scale.x).toBeCloseTo(haloDiameter(RADIUS, haloStrength(0.1)));
    expect(sprite?.scale.x).toBeLessThanOrEqual(RADIUS * 2);
    halos.dispose();
  });

  it('measures the room left to the nearest frame edge at the emitter depth', () => {
    const view = camera();
    expect(frameRoom(view, new Vector3(0, 0, 0))).toBeCloseTo(4);
    expect(frameRoom(view, new Vector3(1, 0, 0))).toBeCloseTo(2);
    expect(frameRoom(view, new Vector3(3, 0, 0))).toBe(0);
    expect(frameRoom(view, new Vector3(0, 0, 5))).toBe(0);
  });

  it('shrinks a glow wider than the view so it fades out inside the frame', () => {
    const lamp = source(1, 3.5);
    lamp.object3d.updateMatrixWorld(true);
    const halos = createEmitterHalos(lamp, 'dark');
    halos.sync();
    const [sprite] = halos.sprites;
    if (sprite === undefined) throw new Error('no halo');
    expect(sprite.scale.x).toBeCloseTo(haloDiameter(3.5, 1));
    const view = camera();
    fitHalo(sprite, sprite.scale.x, view);
    expect(sprite.scale.x).toBeCloseTo(4);
    expect(sprite.frustumCulled).toBe(false);
    halos.dispose();
  });

  it('draws only outside the model stencil and never depth cuts through the body', () => {
    const halos = createEmitterHalos(source(1), 'dark');
    const material = halos.sprites[0]?.material;
    expect(material?.depthTest).toBe(false);
    expect(material?.depthWrite).toBe(false);
    expect(material?.stencilWrite).toBe(true);
    expect(material?.stencilFunc).toBe(NotEqualStencilFunc);
    expect(material?.stencilRef).toBe(SILHOUETTE_STENCIL);
    halos.dispose();
  });

  it('dims with the level and tints by theme', () => {
    const dim = createEmitterHalos(source(0.1), 'light');
    const bright = createEmitterHalos(source(0.8), 'light');
    dim.sync();
    bright.sync();
    const [sprite] = dim.sprites;
    expect(sprite?.material.blending).toBe(NormalBlending);
    expect(bright.sprites[0]?.material.opacity).toBeGreaterThan(sprite?.material.opacity ?? 1);
    expect(bright.sprites[0]?.scale.x).toBeGreaterThan(sprite?.scale.x ?? 1);
    dim.setTheme('dark');
    expect(sprite?.material.blending).toBe(AdditiveBlending);
    dim.dispose();
    bright.dispose();
    expect(sprite?.parent).toBeNull();
  });
});
