import type { ModelSpec, ModelSpecShot } from '@smarteverything/domain';
import { Box3, Sprite, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { buildModel } from './build-model';
import {
  blendPose,
  CONTAIN_PADDING,
  createViewCamera,
  easeInOut,
  fitDistance,
  focusPoint,
  framedShot,
  frameView,
  modelBounds,
  posePosition,
  shotPose,
  shotProgress,
  type CameraPose,
} from './framing';

const VIEW = { yaw: 30, pitch: 18, fov: 28, padding: 0.1 } as const;

function towerSpec(height: number): ModelSpec {
  return {
    schema: 1,
    id: 'dev.test.tower',
    version: '1.0.0',
    title: 'Tower',
    category: 'test',
    footprint: { width: 0.3, depth: 0.3, height },
    framing: { tile: VIEW, card: { ...VIEW, focus: 'knob' }, hero: { ...VIEW, yaw: 20 } },
    materials: { body: { finish: 'graphite' } },
    parts: [
      {
        id: 'body',
        geometry: {
          type: 'roundedBox',
          width: 0.3,
          height,
          depth: 0.3,
          radius: 0.02,
          segments: 3,
        },
        material: 'body',
        transform: { position: [0, height / 2, 0] },
      },
      {
        id: 'knob',
        parent: 'body',
        geometry: { type: 'sphere', radius: 0.02 },
        material: 'body',
        transform: { position: [0, height / 2, 0.15] },
        minLod: 1,
      },
    ],
    anchors: [
      {
        kind: 'screen',
        id: 'face',
        parent: 'knob',
        position: [0, 0.05, 0],
        width: 0.1,
        height: 0.05,
      },
    ],
  };
}

const SHOT: ModelSpecShot = {
  id: 'work',
  when: { anyOf: [{ allOf: [{ signal: 'power', op: 'eq', value: true }] }] },
  focus: 'knob',
  zoom: 2,
  yaw: 10,
  pitch: 25,
  orbit: 12,
  easeMs: 900,
  loopS: 30,
  symmetry: 360,
  stillAt: 0,
};

function projectedExtent(pose: CameraPose, aspect: number, box: Box3): number {
  const view = createViewCamera();
  view.apply(pose, aspect);
  view.camera.updateMatrixWorld(true);
  let extent = 0;
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        const ndc = new Vector3(x, y, z).project(view.camera);
        extent = Math.max(extent, Math.abs(ndc.x), Math.abs(ndc.y));
      }
    }
  }
  return extent;
}

describe('framing', () => {
  it('fits the whole model inside the padded frame and touches it', () => {
    const spec = towerSpec(1.6);
    const model = buildModel(spec, { lod: 0 });
    const pose = frameView(model, spec, 'tile', 1);
    const box = new Box3().setFromObject(model.group);
    expect(projectedExtent(pose, 1, box)).toBeLessThanOrEqual(0.9 + 1e-6);
    expect(projectedExtent(pose, 1, box)).toBeGreaterThan(0.85);
  });

  it('normalises visual weight so a small and a tall model fill the tile equally', () => {
    const small = towerSpec(0.2);
    const tall = towerSpec(1.8);
    const a = buildModel(small, { lod: 0 });
    const b = buildModel(tall, { lod: 0 });
    const fillA = projectedExtent(
      frameView(a, small, 'tile', 1),
      1,
      new Box3().setFromObject(a.group),
    );
    const fillB = projectedExtent(
      frameView(b, tall, 'tile', 1),
      1,
      new Box3().setFromObject(b.group),
    );
    expect(fillA).toBeCloseTo(fillB, 1);
  });

  it('needs more distance for a tall model in a narrow frame', () => {
    const spec = towerSpec(1.6);
    const model = buildModel(spec, { lod: 0 });
    const box = new Box3().setFromObject(model.group);
    const aim = { yaw: 30, pitch: 18, fov: 28, padding: 0.1 };
    const target = [0, 0.8, 0] as const;
    expect(fitDistance(box, target, { ...aim, aspect: 1 })).toBeLessThan(
      fitDistance(box, target, { ...aim, aspect: 0.1 }),
    );
  });

  it('uses the per view yaw and focus and walks up to a built part at low LOD', () => {
    const spec = towerSpec(1);
    const hero = frameView(buildModel(spec, { lod: 2 }), spec, 'hero', 1);
    expect(hero.yaw).toBe(20);
    const card = frameView(buildModel(spec, { lod: 1 }), spec, 'card', 1);
    expect(card.target[1]).toBeCloseTo(1);
    expect(card.target[2]).toBeCloseTo(0.15);
    const low = buildModel(spec, { lod: 0 });
    expect(focusPoint(low, spec, 'knob')[1]).toBeCloseTo(0.5);
    expect(focusPoint(buildModel(spec, { lod: 1 }), spec, 'face')[1]).toBeCloseTo(1.05);
  });

  it('places the house camera at yaw 30 and pitch 18 around the target', () => {
    const pose: CameraPose = {
      target: [0, 0, 0],
      yaw: 30,
      pitch: 18,
      distance: 2,
      fov: 28,
      reach: 0.5,
    };
    const [x, y, z] = posePosition(pose);
    expect(Math.hypot(x, y, z)).toBeCloseTo(2);
    expect((Math.atan2(x, z) * 180) / Math.PI).toBeCloseTo(30);
    expect((Math.asin(y / 2) * 180) / Math.PI).toBeCloseTo(18);
    const view = createViewCamera();
    view.apply(pose, 1.5);
    expect(view.camera.fov).toBe(28);
    expect(view.camera.aspect).toBe(1.5);
    expect(view.camera.near).toBeGreaterThan(0);
    expect(view.camera.far).toBeGreaterThan(2);
  });
});

describe('model bounds', () => {
  function glowingSpec(): ModelSpec {
    const base = towerSpec(1);
    return {
      ...base,
      materials: { ...base.materials, accent: { color: '#5ED3CF', roughness: 0.3, opacity: 0 } },
      parts: [
        ...base.parts,
        {
          id: 'aura',
          parent: 'body',
          geometry: { type: 'glow', width: 3, height: 3, segments: 8 },
          material: 'accent',
          transform: { position: [0, 0, 0.2] },
        },
      ],
    };
  }

  it('counts only the body: glow parts and halo sprites never widen the framing', () => {
    const plain = buildModel(towerSpec(1), { lod: 1 });
    const glowing = buildModel(glowingSpec(), { lod: 1 });
    const halo = new Sprite();
    halo.scale.setScalar(5);
    glowing.group.add(halo);
    const expected = modelBounds(plain);
    const bounds = modelBounds(glowing);
    expect(bounds.min.toArray()).toEqual(expected.min.toArray());
    expect(bounds.max.toArray()).toEqual(expected.max.toArray());
    const spec = glowingSpec();
    expect(frameView(glowing, spec, 'tile', 1).distance).toBeCloseTo(
      frameView(plain, towerSpec(1), 'tile', 1).distance,
    );
  });

  it('leaves hidden parts out of the bounds', () => {
    const model = buildModel(towerSpec(1), { lod: 1 });
    const whole = modelBounds(model);
    const knob = model.parts.find((part) => part.id === 'knob');
    if (knob === undefined) throw new Error('knob missing');
    knob.mesh.visible = false;
    expect(modelBounds(model).max.z).toBeLessThan(whole.max.z);
  });
});

describe('shot cameras', () => {
  it('moves to the focus part, zooms by the shot scale and orbits by degrees per second', () => {
    const spec = towerSpec(1);
    const model = buildModel(spec, { lod: 1 });
    const framed = frameView(model, spec, 'tile', 1);
    const focus = focusPoint(model, spec, SHOT.focus);
    const start = shotPose(framed, SHOT, focus, 0);
    expect(start.target).toEqual(focus);
    expect(start.distance).toBeCloseTo(framed.distance / 2);
    expect(start.pitch).toBe(25);
    expect(shotPose(framed, SHOT, focus, 2).yaw).toBeCloseTo(34);
  });

  it('eases in and out between the framing and the shot', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5);
    expect(easeInOut(0.1)).toBeLessThan(0.1);
    expect(easeInOut(0.9)).toBeGreaterThan(0.9);
    expect(shotProgress(450, 900)).toBeCloseTo(0.5);
    expect(shotProgress(2000, 900)).toBe(1);
    expect(shotProgress(0, 0)).toBe(1);
  });

  it('blends poses along the shortest yaw and returns to the framing exactly', () => {
    const a: CameraPose = {
      target: [0, 0, 0],
      yaw: 350,
      pitch: 10,
      distance: 4,
      fov: 28,
      reach: 1,
    };
    const b: CameraPose = { target: [1, 1, 1], yaw: 10, pitch: 30, distance: 1, fov: 28, reach: 1 };
    const mid = blendPose(a, b, 0.5);
    expect(mid.yaw).toBeCloseTo(360);
    expect(mid.distance).toBeCloseTo(2);
    expect(mid.target).toEqual([0.5, 0.5, 0.5]);
    expect(blendPose(a, b, 0)).toEqual(a);
    const back = blendPose(b, a, 1);
    expect(back.target).toEqual(a.target);
    expect(back.distance).toBeCloseTo(a.distance);
  });
});

describe('shot containment', () => {
  const frame = { aspect: 1.5, shot: SHOT, elapsedS: 0, progress: 1 } as const;

  it('keeps the whole model inside the tile however far the shot zooms', () => {
    const spec = towerSpec(1.6);
    const model = buildModel(spec, { lod: 0 });
    const pose = framedShot(model, spec, { ...frame, view: 'tile' });
    const box = new Box3().setFromObject(model.group);
    expect(projectedExtent(pose, 1.5, box)).toBeLessThanOrEqual(1 - CONTAIN_PADDING + 1e-6);
  });

  it('slides the aim towards the kept box instead of backing away from an edge focus', () => {
    const spec = towerSpec(1.6);
    const model = buildModel(spec, { lod: 1 });
    const pose = framedShot(model, spec, { ...frame, view: 'tile' });
    const box = modelBounds(model);
    const focus = focusPoint(model, spec, SHOT.focus);
    const aim = { yaw: pose.yaw, pitch: pose.pitch, fov: pose.fov, padding: CONTAIN_PADDING };
    expect(pose.distance).toBeLessThan(fitDistance(box, focus, { ...aim, aspect: 1.5 }) - 1e-6);
    expect(pose.target[1]).toBeLessThan(focus[1]);
    expect(pose.target[1]).toBeGreaterThanOrEqual(box.getCenter(new Vector3()).y - 1e-9);
    expect(projectedExtent(pose, 1.5, box)).toBeLessThanOrEqual(1 - CONTAIN_PADDING + 1e-6);
    expect(projectedExtent(pose, 1.5, box)).toBeGreaterThan(1 - CONTAIN_PADDING - 0.02);
  });

  it('keeps the shot aim when the kept box already fits around it', () => {
    const spec = towerSpec(1.6);
    const model = buildModel(spec, { lod: 1 });
    const gentle = { ...SHOT, zoom: 0.5, orbit: 0 };
    const pose = framedShot(model, spec, { ...frame, view: 'tile', shot: gentle });
    focusPoint(model, spec, SHOT.focus).forEach((value, axis) => {
      expect(pose.target[axis]).toBeCloseTo(value, 9);
    });
  });

  it('keeps the whole model on a card without a named defining feature', () => {
    const spec = { ...towerSpec(1.6), framing: { ...towerSpec(1.6).framing, card: VIEW } };
    const model = buildModel(spec, { lod: 1 });
    const pose = framedShot(model, spec, { ...frame, view: 'card' });
    const box = new Box3().setFromObject(model.group);
    expect(projectedExtent(pose, 1.5, box)).toBeLessThanOrEqual(1 - CONTAIN_PADDING + 1e-6);
  });

  it('lets the hero crop when no defining feature is named and returns the framing at rest', () => {
    const spec = towerSpec(1.6);
    const model = buildModel(spec, { lod: 2 });
    const zoomed = framedShot(model, spec, { ...frame, view: 'hero' });
    expect(zoomed.distance).toBeCloseTo(frameView(model, spec, 'hero', 1.5).distance / SHOT.zoom);
    const rest = framedShot(model, spec, { ...frame, view: 'hero', shot: undefined });
    expect(rest).toEqual(frameView(model, spec, 'hero', 1.5));
  });
});
