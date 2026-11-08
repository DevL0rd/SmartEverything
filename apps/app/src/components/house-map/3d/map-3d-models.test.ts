import { describe, expect, it, vi, type Mock } from 'vitest';
import { floorOf, placement } from '../lighting-fixture';
import type { RenderScene } from '../render-scene';
import { Map3dBridge } from './map-3d-bridge';
import type { Map3dHandle } from './map-3d-protocol';
import { Map3dSession, type SceneRenderer } from './map-3d-session';
import type { ObjectsHook, SceneModelsWire } from './render-core-objects';

const floor = floorOf([placement('lamp', 1, 1)]);

const scene: RenderScene = {
  key: 'home:1',
  source: 'home_map',
  bounds: null,
  floors: [floor],
  issues: [],
};

const MODELS: SceneModelsWire = { specs: [], devices: { lamp: 'dev.light.bulb' } };

function handle(): Map3dHandle & { readonly setModels: Mock<Map3dHandle['setModels']> } {
  return {
    setScene: vi.fn(),
    setPose: vi.fn(),
    clearPose: vi.fn(),
    setTrail: vi.fn(),
    setModels: vi.fn<Map3dHandle['setModels']>(),
    setLive: vi.fn(),
    setScan: vi.fn(),
    clearScan: vi.fn(),
    setScanPlacement: vi.fn(),
    setScanBand: vi.fn(),
    clearScanBand: vi.fn(),
    setEditFloor: vi.fn(),
    setEdit: vi.fn(),
    editResult: vi.fn(),
    clearEdit: vi.fn(),
  };
}

function hook(): ObjectsHook & {
  readonly setFloor: Mock<ObjectsHook['setFloor']>;
  readonly setModels: Mock<ObjectsHook['setModels']>;
} {
  return {
    setFloor: vi.fn<ObjectsHook['setFloor']>(),
    setModels: vi.fn<ObjectsHook['setModels']>(),
    setLook: vi.fn(),
    setLodBias: vi.fn(),
    select: vi.fn(),
  };
}

function renderer(objects: ObjectsHook): SceneRenderer {
  return {
    objects,
    live: { setFloor: vi.fn(), setLive: vi.fn() },
    realistic: {
      setScan: vi.fn(),
      setPlacement: vi.fn(),
      setBand: vi.fn(),
      setFloor: vi.fn(),
      setLighting: vi.fn(),
    },
    setGeometry: vi.fn(),
    setPose: vi.fn(),
    setLiveTrail: vi.fn(),
    setPreset: vi.fn(),
    setActive: vi.fn(),
    setEdit: vi.fn(),
    editResult: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
  };
}

describe('scene models over the 3D map wire', () => {
  it('sends the models once per value and again after the page reloads', () => {
    const target = handle();
    const bridge = new Map3dBridge(() => target);
    bridge.setModels(MODELS);
    expect(target.setModels).not.toHaveBeenCalled();
    bridge.ready();
    bridge.setScene(scene, floor);
    bridge.setModels(MODELS);
    expect(target.setModels).toHaveBeenCalledTimes(1);
    expect(target.setModels).toHaveBeenCalledWith(JSON.stringify(MODELS));
    bridge.ready();
    expect(target.setModels).toHaveBeenCalledTimes(2);
  });

  it('hands the scene floor and the parsed models to the objects layer', () => {
    const objects = hook();
    const session = new Map3dSession(renderer(objects));
    session.loadScene('home:1:ground', 'home_map', JSON.stringify(floor));
    expect(objects.setFloor).toHaveBeenCalledWith(floor, 'light');
    session.setModels(JSON.stringify(MODELS));
    const [models] = objects.setModels.mock.calls[0] ?? [];
    expect(models?.deviceSpecOf(placement('lamp', 0, 0))).toBeUndefined();
    expect(() => {
      session.setModels(JSON.stringify({ specs: [{ id: 'bad' }], devices: {} }));
    }).toThrow();
  });
});
