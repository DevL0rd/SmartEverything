import { MODEL_SPEC, type ModelSpec } from '@smarteverything/domain';
import {
  Mesh,
  PerspectiveCamera,
  Sprite,
  Texture,
  Vector3,
  type Camera,
  type Material,
  type Object3D,
} from 'three';
import { describe, expect, it } from 'vitest';
import { createViewCamera } from '../../../components/models/three/framing';
import {
  alphaBounds,
  anchorExtent,
  createBakeRig,
  groupOf,
  layerPlans,
  movingGroups,
  projectAnchors,
  projectRect,
  renderPass,
  stillPose,
  targetSignals,
  type BakeRig,
  type PassRenderer,
} from './bake-layers';
import type { BakeKey } from './bake-protocol';

const FRONT = { yaw: 0, pitch: 0, fov: 30, padding: 0.1 } as const;

function fanSpec(): ModelSpec {
  return MODEL_SPEC.parse({
    schema: 1,
    id: 'dev.test.fan',
    version: '1.0.0',
    title: 'Fan',
    category: 'climate',
    footprint: { width: 0.3, depth: 0.2, height: 0.4 },
    framing: { tile: FRONT, card: FRONT, hero: FRONT },
    materials: { body: { finish: 'matte-white' }, glow: { color: '#ffffff' } },
    parts: [
      {
        id: 'base',
        geometry: {
          type: 'roundedBox',
          width: 0.3,
          height: 0.05,
          depth: 0.2,
          radius: 0.01,
          segments: 4,
        },
        material: 'body',
        contact: true,
      },
      {
        id: 'head',
        parent: 'base',
        geometry: {
          type: 'cylinder',
          height: 0.04,
          topRadius: 0.12,
          bottomRadius: 0.12,
          segments: 24,
        },
        material: 'body',
        transform: { position: [0, 0.25, 0], rotation: [90, 0, 0] },
      },
      {
        id: 'blades',
        parent: 'head',
        geometry: {
          type: 'cylinder',
          height: 0.01,
          topRadius: 0.1,
          bottomRadius: 0.1,
          segments: 24,
        },
        material: 'body',
        transform: { position: [0, 0.03, 0] },
      },
      {
        id: 'led',
        parent: 'base',
        geometry: { type: 'sphere', radius: 0.01, segments: 12 },
        material: 'glow',
        transform: { position: [0.1, 0.03, 0.1] },
      },
    ],
    anchors: [
      {
        kind: 'screen',
        id: 'display',
        parent: 'base',
        position: [0, 0.03, 0.101],
        width: 0.08,
        height: 0.02,
      },
      { kind: 'label', id: 'pin', position: [0, 0.4, 0] },
    ],
    channels: [
      {
        id: 'spin',
        target: 'blades',
        property: 'rotate',
        axis: 'z',
        source: 'speed',
        map: { type: 'speed', in: [0, 1], perSecond: [0, 4] },
        motion: { type: 'spin' },
        reduced: 'hold',
      },
      {
        id: 'ledGlow',
        target: 'led',
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
        zoom: 1.5,
        yaw: 0,
        pitch: 0,
        easeMs: 400,
        loopS: 1,
        symmetry: 72,
        stillAt: 0.2,
      },
    ],
    states: { off: { power: false, speed: 0 }, on: { power: true, speed: 0.5 } },
  });
}

function fanKey(target: BakeKey['target']): BakeKey {
  return {
    specHash: 'spec',
    bakeVersion: 2,
    tokenHash: 'tokens',
    finish: null,
    params: {},
    view: 'card',
    width: 160,
    height: 120,
    dpr: 2,
    theme: 'dark',
    target,
  };
}

interface Seen {
  readonly name: string;
  readonly visible: boolean;
  readonly writes: boolean;
}

function shown(node: Object3D): boolean {
  for (let at: Object3D | null = node; at !== null; at = at.parent) if (!at.visible) return false;
  return true;
}

function writes(material: Material | Material[]): boolean {
  return !Array.isArray(material) && material.colorWrite;
}

function drawn(node: Object3D): node is Mesh | Sprite {
  return node instanceof Mesh || node instanceof Sprite;
}

function seenOf(node: Mesh | Sprite): Seen {
  return { name: node.name, visible: shown(node), writes: writes(node.material) };
}

function recorder(frames: Seen[][]): PassRenderer {
  return {
    render: (scene: Object3D): void => {
      const seen: Seen[] = [];
      scene.traverse((node) => {
        if (drawn(node)) seen.push(seenOf(node));
      });
      frames.push(seen);
    },
  };
}

function rigOf(): BakeRig {
  return createBakeRig(new Texture(), fanSpec(), fanKey({ kind: 'keyframe', state: 'on' }));
}

function cameraFor(rig: BakeRig): Camera {
  const view = createViewCamera();
  view.apply(stillPose(rig, fanKey({ kind: 'keyframe', state: 'on' })), 160 / 120);
  view.camera.updateMatrixWorld(true);
  return view.camera;
}

function painted(frame: readonly Seen[] | undefined): readonly string[] {
  return (frame ?? []).filter((seen) => seen.visible && seen.writes).map((seen) => seen.name);
}

describe('bake layers', () => {
  it('finds the signals of a keyframe and of the state that starts a shot', () => {
    const spec = fanSpec();
    expect(targetSignals(spec, { kind: 'keyframe', state: 'off' })).toEqual({
      power: false,
      speed: 0,
    });
    expect(targetSignals(spec, { kind: 'shot', shotId: 'blades' })).toEqual({
      power: true,
      speed: 0.5,
    });
    expect(targetSignals(spec, { kind: 'keyframe', state: 'missing' })).toBeNull();
    expect(targetSignals(spec, { kind: 'shot', shotId: 'missing' })).toBeNull();
  });

  it('gives a part that turns about the view axis its own layer', () => {
    const groups = movingGroups(fanSpec(), 'card', new Set(['base', 'head', 'blades', 'led']));
    expect([...groups]).toEqual([['blades', ['spin']]]);
    expect(movingGroups(fanSpec(), 'card', new Set(['base']))).toEqual(new Map());
  });

  it('assigns a node to its nearest moving ancestor', () => {
    const rig = rigOf();
    const groups = new Map([['blades', ['spin']]]);
    const blades = rig.live.object3d.getObjectByName('blades');
    const base = rig.live.object3d.getObjectByName('base');
    expect(blades && groupOf(blades, groups)).toBe('blades');
    expect(base && groupOf(base, groups)).toBeNull();
    rig.dispose();
  });

  it('draws the body without the moving part, the part over a depth body, a white mask and the shadow', () => {
    const frames: Seen[][] = [];
    const rig = rigOf();
    const groups = movingGroups(rig.spec, 'card', new Set(rig.built.parts.map((part) => part.id)));
    const plans = layerPlans(rig, groups);
    expect(plans.map((plan) => plan.id)).toEqual(['body', 'blades', 'emissive', 'shadow']);
    const camera = cameraFor(rig);
    for (const plan of plans) renderPass(recorder(frames), rig, camera, plan.pass);
    const [body, part, mask, shadow] = frames;
    expect(painted(body)).toEqual(expect.arrayContaining(['base', 'head', 'led']));
    expect(painted(body)).not.toContain('blades');
    expect(painted(part).filter((name) => !name.endsWith(':silhouette'))).toEqual(['blades']);
    expect(painted(mask)).toEqual(['led']);
    expect(painted(shadow)).toEqual(['dev.test.fan.contact-shadow']);
    const base = rig.live.object3d.getObjectByName('base');
    expect(base !== undefined && drawn(base) && seenOf(base).writes).toBe(true);
    rig.dispose();
  });

  it('projects screen anchors to a rectangle and labels to a point inside the canvas', () => {
    const rig = rigOf();
    const camera = cameraFor(rig);
    const anchors = projectAnchors(rig, camera, { width: 160, height: 120, dpr: 2 });
    const display = anchors.find((anchor) => anchor.id === 'display');
    const pin = anchors.find((anchor) => anchor.id === 'pin');
    expect(display?.rect.width).toBeGreaterThan(0);
    expect(display?.rect.height).toBeGreaterThan(0);
    expect(display?.rect.width).toBeGreaterThan(display?.rect.height ?? 0);
    expect(pin?.rect.width).toBe(0);
    expect(pin?.rect.y).toBeLessThan(display?.rect.y ?? 0);
    rig.dispose();
  });

  it('reads the extent of every anchor kind', () => {
    expect(anchorExtent({ kind: 'screen', id: 's', width: 2, height: 1 })).toHaveLength(8);
    expect(anchorExtent({ kind: 'label', id: 'l' })).toEqual([[0, 0, 0]]);
    expect(anchorExtent({ kind: 'hit', id: 'h', size: [2, 2, 2] })[0]).toEqual([-1, -1, -1]);
  });

  it('projects points through a camera into canvas pixels', () => {
    const camera = new PerspectiveCamera(90, 1, 0.1, 10);
    camera.position.set(0, 0, 1);
    camera.updateMatrixWorld(true);
    const rect = projectRect([new Vector3(0, 0, 0), new Vector3(1, 1, 0)], camera, 100, 100);
    expect(rect.x).toBeCloseTo(50);
    expect(rect.y).toBeCloseTo(0);
    expect(rect.width).toBeCloseTo(50);
    expect(rect.height).toBeCloseTo(50);
  });

  it('finds the bounds of the opaque pixels, or none', () => {
    const data = new Uint8Array(4 * 4 * 4);
    expect(alphaBounds(data, 4, 4)).toBeNull();
    data[(1 * 4 + 2) * 4 + 3] = 10;
    data[(3 * 4 + 1) * 4 + 3] = 255;
    expect(alphaBounds(data, 4, 4)).toEqual({ x: 1, y: 1, width: 2, height: 3 });
  });
});
