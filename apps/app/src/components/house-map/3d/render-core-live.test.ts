import {
  DirectionalLight,
  Group,
  HemisphereLight,
  PerspectiveCamera,
  PointLight,
  type Object3D,
} from 'three';
import { describe, expect, it, vi, type Mock } from 'vitest';
import { DAYLIGHT, DUSK, floorLighting, type FloorLighting } from '../lighting';
import { floorOf, input, ON, placement } from '../lighting-fixture';
import type { OverlayModel } from '../overlays/model-types';
import type { RenderFloor, RenderOpening } from '../render-scene';
import { HandleSlot, Map3dBridge } from './map-3d-bridge';
import { LIVE_WIRE, liveOverlayOf, type LiveWire, type Map3dHandle } from './map-3d-protocol';
import { Map3dSession, type SceneRenderer } from './map-3d-session';
import { deviceLightsOf, LiveLayer, type ItemSource, type LiveHook } from './render-core-live';
import { deviceKey } from './scene-object-boxes';
import type { SceneObjectItem, SceneObjectModel } from './scene-objects';

const EMPTY: OverlayModel = {
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

const door: RenderOpening = {
  id: 'door',
  wallId: null,
  from: { x: 4, y: 1 },
  to: { x: 4, y: 2 },
  kind: 'door',
  sourceKind: null,
  sillHeight: 0,
  headHeight: 2,
  hinge: 'left',
  swing: 'in',
  contactDeviceId: 'contact',
  lockDeviceId: null,
  roomIds: ['kitchen', 'hall'],
};

const LIGHTS = [placement('a', 1, 1), placement('b', 3, 3), placement('lamp', 6, 2)];

const FLOOR: RenderFloor = { ...floorOf(LIGHTS), openings: [door] };

const lit = (enabled: boolean): FloorLighting =>
  floorLighting({ ...input(LIGHTS, { a: ON, b: ON, lamp: ON }, enabled), floor: FLOOR });

const wire = (overlay: Partial<OverlayModel>, lighting: FloorLighting): LiveWire =>
  LIVE_WIRE.parse(
    JSON.parse(JSON.stringify({ overlay: liveOverlayOf({ ...EMPTY, ...overlay }), lighting })),
  );

const CAMERA = new PerspectiveCamera();

const realLightsOf = (floor: RenderFloor, items: ItemSource): ReadonlySet<string> =>
  new Set(
    deviceLightsOf(floor, items).flatMap(({ deviceId, lights }) =>
      lights.length > 0 ? [deviceId] : [],
    ),
  );

const contact = (state: 'open' | 'closed'): Partial<OverlayModel> => ({
  openings: [{ id: 'door', contact: state, leafDeg: 0, warning: false, locked: null }],
});

function modelWithLight(visible: boolean): SceneObjectModel {
  const object3d = new Group();
  const light = new PointLight(0xffffff, 1);
  light.visible = visible;
  object3d.add(light);
  return { object3d, dispose: (): void => undefined };
}

function itemsOf(models: Readonly<Record<string, SceneObjectModel>>): ItemSource {
  return {
    item: (key): SceneObjectItem<SceneObjectModel> | undefined => {
      const entry = Object.entries(models).find(([id]) => deviceKey(id) === key);
      return entry === undefined
        ? undefined
        : { key, kind: 'device', floorId: 'ground', lod: 2, model: entry[1], box: null };
    },
  };
}

function layerOf(items: ItemSource | null = null): {
  readonly layer: LiveLayer;
  readonly sun: DirectionalLight;
  readonly sky: HemisphereLight;
  readonly changes: () => number;
} {
  const sun = new DirectionalLight(0xffffff, 1.8);
  const sky = new HemisphereLight(0xffffff, 0x8a8a8a, 1.6);
  let count = 0;
  const layer = new LiveLayer({
    lights: [sky, sun],
    createDecals: null,
    items,
    onChange: (): void => {
      count += 1;
    },
  });
  layer.setFloor(FLOOR, 'light');
  return { layer, sun, sky, changes: () => count };
}

const named = (root: Object3D, prefix: string): readonly Object3D[] => {
  const found: Object3D[] = [];
  root.traverse((object) => {
    if (object.name.startsWith(prefix)) found.push(object);
  });
  return found;
};

function poolShares(root: Object3D): ReadonlyMap<string, number> {
  const shares = new Map<string, number>();
  for (const mesh of named(root, 'light-pool:')) {
    const lights: unknown = mesh.userData['lights'];
    if (!Array.isArray(lights)) continue;
    for (const id of lights) {
      if (typeof id === 'string') shares.set(id, (shares.get(id) ?? 0) + 1);
    }
  }
  return shares;
}

describe('3d live layer', () => {
  it('gives every lit light exactly one floor contribution: a room pool or its own real light', () => {
    const items = itemsOf({ lamp: modelWithLight(true) });
    const { layer } = layerOf(items);
    layer.setLive(wire({}, lit(true)));
    const real = realLightsOf(FLOOR, items);
    const shares = poolShares(layer.group);
    for (const id of ['a', 'b', 'lamp']) {
      expect((shares.get(id) ?? 0) + (real.has(id) ? 1 : 0)).toBe(1);
    }
    expect(real.has('lamp')).toBe(true);
    expect(shares.has('lamp')).toBe(false);
    const hidden = itemsOf({ lamp: modelWithLight(false) });
    const fallback = layerOf(hidden);
    fallback.layer.setLive(wire({}, lit(true)));
    expect(realLightsOf(FLOOR, hidden).size).toBe(0);
    expect(poolShares(fallback.layer.group).get('lamp')).toBe(1);
  });

  it('turns real lights into floor pools while the scaler asks for it and back again', () => {
    const lamp = modelWithLight(true);
    const items = itemsOf({ lamp });
    const { layer, changes } = layerOf(items);
    layer.setLive(wire({}, lit(true)));
    const light = lamp.object3d.children[0];
    expect(poolShares(layer.group).has('lamp')).toBe(false);
    const before = changes();
    layer.setDecalShare(0.25);
    expect(changes()).toBe(before + 1);
    expect(light?.visible).toBe(false);
    expect(poolShares(layer.group).get('lamp')).toBe(1);
    layer.setDecalShare(0.25);
    expect(changes()).toBe(before + 1);
    layer.setDecalShare(0);
    expect(light?.visible).toBe(true);
    expect(poolShares(layer.group).has('lamp')).toBe(false);
  });

  it('hands the climate chips of the live message to the screen marks', () => {
    const { layer } = layerOf();
    expect(layer.chips()).toEqual([]);
    const chip = {
      roomId: 'kitchen',
      at: { x: 1, y: 1 },
      temperature: null,
      pm25: {
        amount: 5,
        value: '5',
        unit: null,
        verdict: 'Good',
        tone: 'positive' as const,
        stale: false,
      },
      heat: null,
    };
    layer.setLive(wire({ climate: [chip] }, lit(false)));
    expect(layer.chips()).toEqual([
      { roomId: 'kitchen', at: { x: 1, y: 1 }, heat: null, text: 'PM2.5 5', tone: 'positive' },
    ]);
  });

  it('dims the sky while the lights are on and restores daylight when the toggle is off', () => {
    const { layer, sun, sky } = layerOf();
    layer.setLive(wire({}, lit(true)));
    expect(sun.intensity).toBeCloseTo(1.8 * DUSK.sunScale, 6);
    expect(sky.intensity).toBeCloseTo(1.6 * DUSK.ambientScale, 6);
    expect(named(layer.group, 'light-pool:').length).toBeGreaterThan(0);
    layer.setLive(wire({}, lit(false)));
    expect(sun.intensity).toBeCloseTo(1.8 * DAYLIGHT.sunScale, 6);
    expect(sky.intensity).toBeCloseTo(1.6, 6);
    expect(sun.color.getHex()).toBe(0xffffff);
    expect(named(layer.group, 'light-pool:')).toHaveLength(0);
  });

  it('plays one pulse and swings the leaf when a door sensor changes, then goes idle', () => {
    const { layer, changes } = layerOf();
    layer.motion(true);
    layer.setLive(wire(contact('closed'), lit(false)));
    const closed = named(layer.group, 'opening:door:0')[0]?.rotation.y;
    const before = changes();
    layer.setLive(wire(contact('open'), lit(false)));
    expect(changes()).toBe(before + 1);
    expect(named(layer.group, 'opening-pulse:door')).toHaveLength(1);
    expect(named(layer.group, 'opening:door:0')[0]?.rotation.y).not.toBeCloseTo(closed ?? 0, 3);
    expect(layer.tick(0, CAMERA)).toBe(true);
    expect(layer.tick(10_000, CAMERA)).toBe(true);
    expect(named(layer.group, 'opening-pulse:door')).toHaveLength(0);
    expect(layer.tick(10_016, CAMERA)).toBe(false);
  });

  it('asks for no frame when the same live message arrives again', () => {
    const { layer, changes } = layerOf();
    layer.setLive(wire(contact('closed'), lit(true)));
    const before = changes();
    layer.setLive(wire(contact('closed'), lit(true)));
    expect(changes()).toBe(before);
  });
});

interface Spies {
  readonly setGeometry: Mock<SceneRenderer['setGeometry']>;
  readonly setFloor: Mock<LiveHook['setFloor']>;
  readonly setLive: Mock<LiveHook['setLive']>;
}

function fakeRenderer(spies: Spies): SceneRenderer {
  return {
    objects: null,
    live: { setFloor: spies.setFloor, setLive: spies.setLive },
    realistic: {
      setScan: vi.fn(),
      setPlacement: vi.fn(),
      setBand: vi.fn(),
      setFloor: vi.fn(),
      setLighting: vi.fn(),
    },
    setGeometry: spies.setGeometry,
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

describe('live wire', () => {
  it('a live message reaches the live layer without rebuilding the scene', () => {
    const spies: Spies = {
      setGeometry: vi.fn<SceneRenderer['setGeometry']>(),
      setFloor: vi.fn<LiveHook['setFloor']>(),
      setLive: vi.fn<LiveHook['setLive']>(),
    };
    const session = new Map3dSession(fakeRenderer(spies));
    session.loadScene('home:ground', 'home_map', JSON.stringify(FLOOR));
    const message = JSON.stringify({ overlay: liveOverlayOf(EMPTY), lighting: lit(true) });
    session.setLive(message);
    session.setLive(message);
    expect(spies.setGeometry).toHaveBeenCalledTimes(1);
    expect(spies.setFloor).toHaveBeenCalledTimes(1);
    expect(spies.setLive).toHaveBeenCalledTimes(2);
  });

  it('the bridge sends live state after the scene, once per change, and again after a reconnect', () => {
    const sent: string[] = [];
    const handle: Map3dHandle = {
      setScene: vi.fn(),
      setPose: vi.fn(),
      clearPose: vi.fn(),
      setTrail: vi.fn(),
      setModels: vi.fn(),
      setLive: (json): void => {
        if (typeof json === 'string') sent.push(json);
      },
      setScan: vi.fn(),
      clearScan: vi.fn(),
      setEditFloor: vi.fn(),
      setEdit: vi.fn(),
      editResult: vi.fn(),
      clearEdit: vi.fn(),
      setScanPlacement: vi.fn(),
      setScanBand: vi.fn(),
      clearScanBand: vi.fn(),
    };
    const slot = new HandleSlot();
    slot.current = handle;
    const bridge = new Map3dBridge(() => slot.current);
    const live = { overlay: { ...EMPTY, ...contact('open') }, lighting: lit(true) };
    bridge.ready();
    bridge.setLive(live);
    expect(sent).toHaveLength(0);
    bridge.setScene(
      { key: 'home', source: 'home_map', bounds: null, floors: [FLOOR], issues: [] },
      FLOOR,
    );
    bridge.setLive(live);
    expect(sent).toHaveLength(1);
    expect(LIVE_WIRE.parse(JSON.parse(sent[0] ?? '')).overlay.openings[0]?.contact).toBe('open');
    bridge.ready();
    expect(sent).toHaveLength(2);
  });

  it('keeps the message to what the 3d map draws', () => {
    const chip = {
      roomId: 'kitchen',
      at: { x: 1, y: 1 },
      temperature: null,
      pm25: null,
      heat: 0.4,
    };
    const overlay = liveOverlayOf({ ...EMPTY, climate: [chip] });
    expect(overlay.climate).toEqual([
      { roomId: 'kitchen', at: { x: 1, y: 1 }, heat: 0.4, text: '', tone: 'info' },
    ]);
  });
});
