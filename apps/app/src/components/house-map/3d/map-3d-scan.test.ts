import { describe, expect, it, vi, type Mock } from 'vitest';
import { floorLighting } from '../lighting';
import { floorOf, input, ON, placement } from '../lighting-fixture';
import type { OverlayModel } from '../overlays/model-types';
import type { RenderFloor, RenderScene } from '../render-scene';
import { Map3dBridge } from './map-3d-bridge';
import {
  liveOverlayOf,
  scanBandOf,
  type Map3dHandle,
  type ScanPlacementWire,
  type ScanSource,
} from './map-3d-protocol';
import { Map3dSession, type SceneRenderer } from './map-3d-session';
import type { RealisticHook } from './render-core-realistic';

const LIGHTS = [placement('lamp', 2, 2)];

const UPSTAIRS: RenderFloor = { ...floorOf(LIGHTS), elevation: 2.8, ceilingHeight: 2.6 };

const HOME: RenderScene = {
  key: 'home:7',
  source: 'home_map',
  bounds: UPSTAIRS.bounds,
  floors: [UPSTAIRS],
  issues: [],
};

const SOURCE: ScanSource = { key: 'home:original:aa', url: 'https://hub.test/a', format: 'ply' };

const PLACEMENT: ScanPlacementWire = { tx: 1, ty: 2, tz: 0.1, yawDeg: 15, scale: 1, opacity: 0.8 };

type Spied<T> = { readonly [K in keyof T]: Mock };

function fakeHandle(): Spied<Map3dHandle> {
  return {
    setScene: vi.fn(),
    setPose: vi.fn(),
    clearPose: vi.fn(),
    setTrail: vi.fn(),
    setModels: vi.fn(),
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

function fakeRealistic(): Spied<RealisticHook> {
  return {
    setScan: vi.fn(),
    setPlacement: vi.fn(),
    setBand: vi.fn(),
    setFloor: vi.fn(),
    setLighting: vi.fn(),
  };
}

function fakeRenderer(realistic: RealisticHook): SceneRenderer {
  return {
    objects: null,
    live: { setFloor: vi.fn(), setLive: vi.fn() },
    realistic,
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

describe('Map3dBridge scan', () => {
  it('sends the scan, its placement and the shown floor band through the scan sender', () => {
    const handle = fakeHandle();
    const bridge = new Map3dBridge(() => handle);
    bridge.setScene(HOME, UPSTAIRS);
    bridge.setScan(SOURCE, PLACEMENT);
    expect(handle.setScan).not.toHaveBeenCalled();
    bridge.ready();
    expect(handle.setScan).toHaveBeenCalledWith(SOURCE.key, SOURCE.url, 'ply');
    expect(handle.setScanPlacement).toHaveBeenCalledWith(1, 2, 0.1, 15, 1, 0.8);
    expect(handle.setScanBand).toHaveBeenCalledWith(2.8, 5.4);
  });

  it('sends a transform edit as a small message without resending the scan', () => {
    const handle = fakeHandle();
    const bridge = new Map3dBridge(() => handle);
    bridge.ready();
    bridge.setScan(SOURCE, PLACEMENT);
    bridge.setScan(SOURCE, { ...PLACEMENT, yawDeg: 40 });
    expect(handle.setScan).toHaveBeenCalledTimes(1);
    expect(handle.setScanPlacement).toHaveBeenCalledTimes(2);
    bridge.setScan(null, null);
    expect(handle.clearScan).toHaveBeenCalledTimes(1);
  });

  it('sends the same scan again when a failed load is retried', () => {
    const handle = fakeHandle();
    const bridge = new Map3dBridge(() => handle);
    bridge.ready();
    bridge.setScan(SOURCE, PLACEMENT);
    bridge.retryScan();
    expect(handle.setScan).toHaveBeenCalledTimes(2);
    expect(handle.setScanPlacement).toHaveBeenCalledTimes(1);
    bridge.setScan(null, null);
    bridge.retryScan();
    expect(handle.clearScan).toHaveBeenCalledTimes(1);
    expect(handle.setScan).toHaveBeenCalledTimes(2);
  });

  it('sends everything again after the page reloads', () => {
    const handle = fakeHandle();
    const bridge = new Map3dBridge(() => handle);
    bridge.ready();
    bridge.setScene(HOME, UPSTAIRS);
    bridge.setScan(SOURCE, PLACEMENT);
    bridge.lost();
    bridge.ready();
    expect(handle.setScan).toHaveBeenCalledTimes(2);
    expect(handle.setScanBand).toHaveBeenCalledTimes(2);
  });

  it('bands a floor from its elevation to its ceiling', () => {
    expect(scanBandOf({ elevation: 0, ceilingHeight: 2.6 })).toEqual({ bottom: 0, top: 2.6 });
  });
});

describe('Map3dSession scan messages', () => {
  it('passes the scan messages, the shown floor and the lights to the realistic layer', () => {
    const realistic = fakeRealistic();
    const session = new Map3dSession(fakeRenderer(realistic));
    session.loadScene('home:7:up', 'home_map', JSON.stringify(UPSTAIRS));
    session.setScan(SOURCE.key, SOURCE.url, SOURCE.format);
    session.setScanPlacement(PLACEMENT);
    session.setScanBand(2.8, 5.4);
    session.clearScanBand();
    session.clearScan();
    const lighting = floorLighting({ ...input(LIGHTS, { lamp: ON }, true), floor: UPSTAIRS });
    const empty: OverlayModel = {
      zones: [],
      activeRooms: [],
      motionDevices: [],
      tracks: [],
      climate: [],
      openings: [],
      vacuum: null,
      cameras: [],
      alerts: [],
      badges: [],
    };
    session.setLive(JSON.stringify({ overlay: liveOverlayOf(empty), lighting }));
    expect(realistic.setFloor).toHaveBeenCalledWith('home:7:up', UPSTAIRS);
    expect(realistic.setScan.mock.calls).toEqual([[SOURCE], [null]]);
    expect(realistic.setPlacement).toHaveBeenCalledWith(PLACEMENT);
    expect(realistic.setBand.mock.calls).toEqual([[{ bottom: 2.8, top: 5.4 }], [null]]);
    expect(realistic.setLighting).toHaveBeenCalledWith(lighting);
  });
});
