import { MODEL_SPEC } from '@smarteverything/domain';
import { PointLight, SpotLight, Texture, type Camera, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { buildModel } from '../../../components/models/three/build-model';
import { frameView, type CameraPose } from '../../../components/models/three/framing';
import { fanSpec } from '../visual/visual-fixture';
import {
  INSPECT_START,
  POLE_PITCH,
  dragInspect,
  inspectPose,
  nearestZoom,
  partReadout,
  partTitle,
  pickPart,
  readingText,
  zoomInspect,
} from './inspect';
import { createInstanceGroups, type DrawInput } from './instancing';
import { createModelCache } from './model-cache';
import { createLiveRenderer, type LiveGl } from './renderer-core';

const framed: CameraPose = {
  target: [0, 0, 0],
  yaw: 20,
  pitch: 10,
  distance: 2,
  fov: 30,
  reach: 0.5,
};

describe('inspect orbit', () => {
  it('turns, tilts and zooms the framed camera', () => {
    const pose = inspectPose(framed, { yaw: 30, pitch: 15, zoom: 2 });
    expect(pose.yaw).toBe(50);
    expect(pose.pitch).toBe(25);
    expect(pose.distance).toBe(1);
    expect(pose.target).toEqual(framed.target);
  });

  it('stops at the pole and keeps the camera outside the model', () => {
    const pose = inspectPose(framed, { yaw: 0, pitch: 500, zoom: 1000 });
    expect(pose.pitch).toBe(POLE_PITCH);
    expect(pose.distance).toBeCloseTo(framed.reach);
    expect(nearestZoom(framed)).toBe(4);
  });

  it('turns half a revolution for a drag across the whole view', () => {
    const turned = dragInspect(INSPECT_START, { dx: -240, dy: 120, widthPx: 240 });
    expect(turned).toEqual({ yaw: 180, pitch: 90, zoom: 1 });
    expect(dragInspect(INSPECT_START, { dx: 10, dy: 0, widthPx: 0 })).toBe(INSPECT_START);
  });

  it('zooms by the pinch scale and ignores a broken scale', () => {
    expect(zoomInspect(INSPECT_START, 1.5).zoom).toBe(1.5);
    expect(zoomInspect(INSPECT_START, 0)).toBe(INSPECT_START);
    expect(zoomInspect(INSPECT_START, Number.NaN)).toBe(INSPECT_START);
  });
});

describe('inspect part picking', () => {
  it('finds the part under a tap and nothing outside the model', () => {
    const spec = fanSpec();
    const model = buildModel(spec, { lod: 2 });
    const pose = inspectPose(frameView(model, spec, 'hero', 1), INSPECT_START);
    const size = { width: 280, height: 280 };
    expect(pickPart(model, pose, { ...size, x: 140, y: 140 })).not.toBeNull();
    expect(pickPart(model, pose, { ...size, x: 1, y: 1 })).toBeNull();
    expect(pickPart(model, pose, { width: 0, height: 0, x: 0, y: 0 })).toBeNull();
    model.dispose();
  });

  it('reads the live state of the channels that move a part', () => {
    const spec = fanSpec();
    const sources = {
      signals: { brightness: 80, colour: '#ffcc00', speed: 0.5 },
      capabilities: {},
    };
    const led = partReadout(spec, 'led', sources);
    expect(led.readings.map(readingText)).toEqual(['Brightness: 80', 'Colour: #ffcc00']);
    expect(partReadout(spec, 'blades', sources).readings.map(readingText)).toEqual(['Speed: 0.5']);
    expect(partReadout(spec, 'base', sources).readings).toEqual([]);
    expect(readingText({ kind: 'signal', name: 'power', value: false })).toBe('Power: Off');
    expect(readingText({ kind: 'signal', name: 'fanSpeed', value: null })).toBe(
      'Fan speed: No reading',
    );
    expect(partTitle('drum_door')).toBe('Drum door');
  });
});

function lightsIn(root: Object3D): number {
  let count = 0;
  root.traverse((node) => {
    if (node instanceof PointLight || node instanceof SpotLight) count += 1;
  });
  return count;
}

describe('inspect real lights', () => {
  it('adds the real emitter lights only to inspected views', () => {
    const base = fanSpec();
    const emitter = {
      kind: 'emitter',
      id: 'bulb',
      parent: 'led',
      position: [0, 0, 0],
      color: '#ffeecc',
      intensity: 1,
      radius: 0.05,
    };
    const spec = MODEL_SPEC.parse({ ...base, anchors: [...(base.anchors ?? []), emitter] });
    const groups = createInstanceGroups(createModelCache(), new Texture());
    const input: DrawInput = {
      spec,
      model: { specHash: 'lit', lod: 2, finish: null, params: {} },
      theme: 'dark',
      signals: { brightness: 100 },
      reduced: false,
      lit: false,
    };
    const plain = groups.join('plain', input);
    const lit = groups.join('lit', { ...input, lit: true });
    expect(lit).not.toBe(plain);
    expect(lightsIn(plain.stage.scene)).toBe(lightsIn(lit.stage.scene) - 1);
    groups.dispose();
  });
});

describe('inspect in the shared renderer', () => {
  it('draws an inspected view from the orbit camera and keeps the others on their shot', () => {
    const cameras: Camera[] = [];
    const gl: LiveGl = {
      autoClear: true,
      setPixelRatio: () => undefined,
      setSize: () => undefined,
      setScissorTest: () => undefined,
      setScissor: () => undefined,
      setViewport: () => undefined,
      clear: () => undefined,
      render: (_scene, camera) => {
        cameras.push(camera);
      },
    };
    const renderer = createLiveRenderer(gl, new Texture());
    renderer.resize(400, 200, 1);
    const shared = {
      spec: fanSpec(),
      model: { specHash: 'fan', lod: 2, finish: null, params: {} },
      view: 'hero',
      theme: 'dark',
      signals: {},
      reduced: false,
    } as const;
    renderer.upsert({ ...shared, id: 'plain' });
    renderer.upsert({ ...shared, id: 'turned', inspect: { yaw: 90, pitch: 0, zoom: 1 } });
    const rect = { x: 0, y: 0, width: 200, height: 200 };
    renderer.place('plain', rect, rect);
    renderer.place('turned', { ...rect, x: 200 }, { ...rect, x: 200 });
    renderer.draw(0);
    const [plain, turned] = cameras;
    expect(plain?.position.x).toBeCloseTo(0);
    expect(Math.abs(turned?.position.x ?? 0)).toBeGreaterThan(0.1);
    renderer.dispose();
  });
});
