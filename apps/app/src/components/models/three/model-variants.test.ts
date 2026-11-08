import type { ModelSpec } from '@smarteverything/domain';
import { Mesh, MeshPhysicalMaterial, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { blurAmount } from '../channels';
import { buildModel, toModelBuffers } from './build-model';
import { createEmitterHalos } from './emitter-halo';
import { CONTAIN_PADDING, fitDistance, framedShot, frameView, modelBounds } from './framing';
import { createSceneModel } from './scene-model';

const VIEW = { yaw: 30, pitch: 18, fov: 28, padding: 0.1 } as const;
const BLUR = { part: 'disc', from: 2, to: 3 } as const;

function fanSpec(): ModelSpec {
  return {
    schema: 1,
    id: 'dev.test.desk-fan',
    version: '1.0.0',
    title: 'Desk fan',
    category: 'climate',
    footprint: { width: 0.3, depth: 0.2, height: 0.9 },
    framing: { tile: VIEW, card: VIEW, hero: VIEW },
    params: { mount: { min: 0, max: 1, default: 0, unit: 'count' } },
    materials: { body: { finish: 'graphite' }, glass: { finish: 'frosted-glass', opacity: 0.6 } },
    parts: [
      {
        id: 'stand',
        geometry: { type: 'cylinder', height: 0.8, topRadius: 0.02, bottomRadius: 0.1 },
        material: 'body',
        visible: { param: 'mount', scale: -1, offset: 1 },
      },
      {
        id: 'bracket',
        geometry: { type: 'sphere', radius: 0.03 },
        material: 'body',
        visible: { param: 'mount' },
      },
      {
        id: 'blades',
        geometry: { type: 'cylinder', height: 0.02, topRadius: 0.15, bottomRadius: 0.15 },
        material: 'body',
        transform: { position: [0, 0.8, 0] },
      },
      {
        id: 'disc',
        parent: 'blades',
        geometry: { type: 'cylinder', height: 0.022, topRadius: 0.15, bottomRadius: 0.15 },
        material: 'glass',
      },
    ],
    anchors: [
      { kind: 'emitter', id: 'led', parent: 'stand', color: '#5ED3CF', intensity: 1, radius: 0.04 },
      { kind: 'emitter', id: 'ring', color: '#FFFFFF', intensity: 1, radius: 0.2 },
    ],
    channels: [
      {
        id: 'spin',
        target: 'blades',
        property: 'rotate',
        axis: 'y',
        source: 'speed',
        map: { type: 'speed', in: [0, 1], perSecond: [0.5, 3] },
        motion: { type: 'spin' },
        reduced: 'hold',
        blur: BLUR,
      },
      {
        id: 'ringOn',
        target: 'ring',
        property: 'emissive',
        source: 'power',
        map: { type: 'enum', table: { true: 1, false: 0 } },
        motion: { type: 'pose' },
        reduced: 'hold',
      },
    ],
    shots: [
      {
        id: 'blades',
        when: { anyOf: [{ allOf: [{ signal: 'speed', op: 'gt', value: 0 }] }] },
        focus: 'blades',
        zoom: 4,
        yaw: 30,
        pitch: 18,
        easeMs: 600,
        loopS: 1,
        symmetry: 72,
        stillAt: 0.5,
      },
    ],
  };
}

function named(root: Object3D, name: string): Object3D {
  const found = root.getObjectByName(name);
  if (found === undefined) throw new Error(`no node ${name}`);
  return found;
}

function opacity(node: Object3D): number {
  if (!(node instanceof Mesh) || !(node.material instanceof MeshPhysicalMaterial)) {
    throw new Error(`${node.name} has no physical material`);
  }
  return node.material.opacity;
}

describe('part visibility from params', () => {
  it('builds the stand on the stand mount and the bracket on the wall mount', () => {
    const stand = buildModel(fanSpec(), { lod: 2 });
    const wall = buildModel(fanSpec(), { lod: 2, params: { mount: 1 } });
    expect(stand.parts.map((part) => part.id)).toEqual(['stand', 'blades', 'disc']);
    expect(wall.parts.map((part) => part.id)).toEqual(['bracket', 'blades', 'disc']);
  });

  it('drops anchors whose parent part is hidden by a param', () => {
    const wall = createSceneModel(fanSpec(), { lod: 2, params: { mount: 1 } });
    expect(wall.emitters.map((emitter) => emitter.id)).toEqual(['ring']);
    wall.dispose();
  });
});

describe('motion blur layer', () => {
  it('builds the blur layer hidden and says so in the renderer buffers', () => {
    const model = buildModel(fanSpec(), { lod: 1 });
    const parts = toModelBuffers(model).parts;
    expect(parts.find((part) => part.id === 'disc')?.visible).toBe(false);
    expect(parts.find((part) => part.id === 'blades')?.visible).toBe(true);
  });

  it('ramps from where the blur starts to where it is full, for spins and sweeps only', () => {
    expect(blurAmount(BLUR, { kind: 'spin', perSecond: 1 })).toBe(0);
    expect(blurAmount(BLUR, { kind: 'spin', perSecond: -2.5 })).toBeCloseTo(0.5);
    expect(blurAmount(BLUR, { kind: 'spin', perSecond: 9 })).toBe(1);
    expect(blurAmount(BLUR, { kind: 'oscillate', limits: [0, 1], speed: 3 })).toBe(1);
    expect(blurAmount(BLUR, { kind: 'value', value: 5, easeMs: 0 })).toBe(0);
    expect(blurAmount(undefined, { kind: 'spin', perSecond: 9 })).toBe(0);
    expect(blurAmount(BLUR, null)).toBe(0);
  });

  it('crossfades the moving part into the blur layer as the speed rises and back when it falls', () => {
    const model = createSceneModel(fanSpec(), { lod: 1 });
    const blades = named(model.object3d, 'blades');
    const disc = named(model.object3d, 'disc');
    model.setSignals({ speed: 0.2 }, { timeS: 0.4 });
    expect(disc.visible).toBe(false);
    expect(opacity(blades)).toBe(1);
    model.setSignals({ speed: 0.8 }, { timeS: 0.4 });
    expect(disc.visible).toBe(true);
    expect(opacity(disc)).toBeCloseTo(0.6 * 0.5);
    expect(opacity(blades)).toBeCloseTo(0.5);
    model.setSignals({ speed: 1 }, { reduced: true });
    expect(opacity(disc)).toBeCloseTo(0.6);
    model.setSignals({ speed: 0 });
    expect(disc.visible).toBe(false);
    expect(opacity(blades)).toBe(1);
    model.dispose();
  });
});

describe('stage glow and tile shots', () => {
  it('shows an additive halo only while its emitter is on', () => {
    const model = createSceneModel(fanSpec(), { lod: 1 });
    const halos = createEmitterHalos(model, 'dark');
    const ring = halos.sprites.find((sprite) => sprite.name === 'ring:halo');
    model.setSignals({ power: true });
    halos.sync();
    expect(ring?.visible).toBe(true);
    expect(ring?.material.opacity).toBeGreaterThan(0);
    model.setSignals({ power: false });
    halos.sync();
    expect(ring?.visible).toBe(false);
    halos.dispose();
    model.dispose();
  });

  it('keeps the whole model in a tile or unfocused card shot with the contain padding', () => {
    const spec = fanSpec();
    const model = buildModel(spec, { lod: 1 });
    const shot = spec.shots?.[0];
    if (shot === undefined) throw new Error('no shot');
    const bounds = modelBounds(model);
    for (const view of ['tile', 'card'] as const) {
      const pose = framedShot(model, spec, { view, aspect: 1.5, shot, elapsedS: 0, progress: 1 });
      const framed = frameView(model, spec, view, 1.5);
      const aim = { ...pose, padding: CONTAIN_PADDING, aspect: 1.5 };
      const whole = fitDistance(bounds, pose.target, aim);
      expect(pose.distance).toBeCloseTo(Math.max(framed.distance / shot.zoom, whole));
      expect(pose.distance).toBeGreaterThanOrEqual(whole - 1e-9);
    }
  });
});
