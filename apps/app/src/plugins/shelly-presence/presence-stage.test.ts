import { createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CLIENT_PREFS, HOME_MAP, type HomeMapStageView } from '@smarteverything/domain';
import { OVERLAY_LOOKS, type LiveOverlay } from '../../components/house-map/3d/overlay-kit';
import { OVERLAY_PARTS } from '../../components/house-map/3d/overlay-parts';
import { liveOverlayOf } from '../../components/house-map/3d/map-3d-protocol';
import { floorLighting } from '../../components/house-map/lighting';
import { input } from '../../components/house-map/lighting-fixture';
import type { StageLiveProps } from '../../components/house-map/live-visibility/stage-host';
import type { OverlayModel } from '../../components/house-map/overlays/model-types';
import type { RenderFloor, RenderRoom } from '../../components/house-map/render-scene';
import type { HomeMapLive, StageContext } from '../../features/home-map';
import type { SensorMapView } from './presence-map';

interface Probe {
  map: object | null;
  scene: object | null;
  feed: object | null;
  readonly drawn: { readonly name: string; readonly props: Record<string, unknown> }[];
}

const probe = vi.hoisted((): Probe => ({ map: null, scene: null, feed: null, drawn: [] }));

const record =
  (name: string) =>
  (props: Record<string, unknown>): null => {
    probe.drawn.push({ name, props });
    return null;
  };

vi.mock('react-native', () => ({
  View: ({ children }: { readonly children?: ReactNode }): ReactNode => children ?? null,
}));
vi.mock('expo-router', () => ({ useRouter: (): object => ({ push: vi.fn() }) }));
vi.mock('../../features/home-map', () => ({
  HomeMap3d: record('map3d'),
  homeMapRealistic: ({ map3d }: { readonly map3d: Record<string, unknown> }): null => {
    probe.drawn.push({ name: 'realistic', props: map3d });
    return null;
  },
  StageStillView: record('still'),
  useHomeMap: (): object => ({ map: probe.map }),
  useHomeMapLive: (): object | null => probe.feed,
  useHomeMapScene: (): object | null => probe.scene,
}));
vi.mock('../../features/home/components/hero-live', () => ({
  useHeroLook: (): object => ({ look: CLIENT_PREFS.home_map_look.defaultValue }),
}));
vi.mock('../../features/home/model/hero', () => ({
  heroPickTarget: (): null => null,
  heroTapTarget: (): null => null,
}));

const { SHELLY_STAGE_PAGE, SensorStageBody, sensorFan, sensorSelection, withSensorFan } =
  await import('./presence-stage');

const living: RenderRoom = {
  id: 'living',
  name: 'Living room',
  homeRoomId: null,
  polygons: [],
  labelAt: { x: 2, y: 2 },
  colourSlot: 1,
  floor: { status: 'none' },
  wallPaint: null,
  ceilingHeight: 2.6,
  areaM2: 16,
  hidden: false,
};

const ground: RenderFloor = {
  id: 'ground',
  name: 'Ground',
  level: 0,
  elevation: 0,
  ceilingHeight: 2.6,
  bounds: { minX: 0, minY: 0, maxX: 8, maxY: 4 },
  rooms: [living],
  walls: [],
  openings: [],
  objects: [],
  placements: [],
  carpets: [],
  markers: [],
  measures: [],
  vacuum: null,
};

const CONE = [
  { x: 0, y: 2 },
  { x: 3, y: 0 },
  { x: 3, y: 4 },
];

const view: SensorMapView = {
  spot: {
    floor: ground,
    room: living,
    placement: {
      deviceId: 'sensor',
      name: null,
      kind: null,
      at: { x: 0, y: 2 },
      rotationDeg: 0,
      height: 2,
      tiltDeg: 0,
      mount: 'wall',
      auto: false,
      camera: null,
      roomId: 'living',
      wall: null,
    },
    pose: { at: { x: 0, y: 2 }, yawDeg: 0 },
  },
  cone: CONE,
  zones: [],
  bounds: { minX: 0, minY: 0, maxX: 8, maxY: 4 },
};

const EMPTY_MODEL: OverlayModel = {
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

const FEED: HomeMapLive = {
  overlay: EMPTY_MODEL,
  lighting: floorLighting(input([], {}, false)),
  summary: 'Home',
};

const MAP = HOME_MAP.parse({
  id: 'home',
  schemaVersion: 1,
  revision: 1,
  name: 'Home',
  north: 0,
  updatedAt: '2026-10-25T11:00:00.000Z',
  sources: [],
  notices: [],
  floors: [],
});

const context: StageContext = {
  variant: 'hero',
  view3d: { preset: 'top', fitSeq: 0, follow: false },
  chrome: [],
  chromeInsets: { top: 0, bottom: 0 },
  focus: { kind: 'none' },
};

const live: StageLiveProps = {
  active: true,
  quality: { renderScale: 1, splatScale: 1, lodBias: 0, decalLightShare: 1, animationDivisor: 1 },
  onReady: vi.fn(),
  onFrameTime: vi.fn(),
  onUnavailable: vi.fn(),
};

function draw(shown: HomeMapStageView, placed: boolean): Probe['drawn'] {
  probe.map = placed ? MAP : null;
  probe.feed = FEED;
  probe.scene = placed
    ? { key: 'home', source: 'home_map', bounds: null, floors: [ground], issues: [] }
    : null;
  probe.drawn.length = 0;
  const stageInput = { view, label: 'Radar in Living room', dimmed: false, shown };
  renderToStaticMarkup(createElement(SensorStageBody, { input: stageInput, context, live }));
  return [...probe.drawn];
}

function fanObjects(model: OverlayModel): readonly string[] {
  const cameras = OVERLAY_PARTS.find((part) => part.name === 'cameras');
  if (cameras === undefined) throw new Error('The 3D overlay must draw camera views');
  const wire: LiveOverlay = liveOverlayOf(model);
  const update = {
    ...{ floor: ground, model: wire, lighting: null },
    ...{ realDeviceIds: new Set<string>(), theme: 'light' as const },
  };
  const look = OVERLAY_LOOKS.light;
  return cameras.build({ update, look, y: 0, pulse: (material) => material }).map((o) => o.name);
}

describe('the Shelly page stage', () => {
  it('remembers its view under its own page', () => {
    expect(SHELLY_STAGE_PAGE).toBe('shelly');
  });

  it('lays the sensor coverage fan flat on the floor of the 3D map', () => {
    const fan = sensorFan(view);
    expect(fan?.view.frustum).toMatchObject({ ring: CONE, floorM: 0, topM: 0 });
    if (fan === null) throw new Error('A placed sensor with a cone has a fan');
    expect(fanObjects({ ...EMPTY_MODEL, cameras: [fan] })).toEqual([
      'frustum-floor:sensor',
      'frustum-edge:sensor',
    ]);
    expect(sensorFan({ ...view, cone: [] })).toBeNull();
  });

  it('adds the fan to the shared live feed once, replacing an earlier view of the sensor', () => {
    const fan = sensorFan(view);
    const fed = withSensorFan(withSensorFan(FEED, fan), fan);
    expect(fed.overlay.cameras).toEqual([fan]);
    expect(withSensorFan(FEED, null)).toBe(FEED);
  });

  it('outlines the sensor room', () => {
    expect(sensorSelection(view)).toEqual(['living']);
    expect(sensorSelection({ ...view, spot: { ...view.spot, room: null } })).toEqual([]);
  });

  it('draws the shared 3D map with the fan, and the iso still with the failure line as fallback', () => {
    for (const shown of ['3d'] as const) {
      const [map3d, ...rest] = draw(shown, true);
      expect(rest).toEqual([]);
      expect(map3d?.name).toBe('map3d');
      expect(map3d?.props).toMatchObject({ selection: ['living'], label: 'Radar in Living room' });
      expect(map3d?.props['feed']).toMatchObject({ overlay: { cameras: [sensorFan(view)] } });
      const fallback = map3d?.props['fallback'];
      expect(isValidElement(fallback)).toBe(true);
      expect(fallback).toMatchObject({ props: { unavailable: true, floor: ground } });
    }
  });

  it('draws the realistic scan when chosen', () => {
    expect(draw('realistic', true).map((item) => item.name)).toEqual(['realistic']);
  });

  it('shows the still while the map scene is not loaded yet', () => {
    const drawn = draw('3d', false);
    expect(drawn.map((item) => item.name)).toEqual(['still']);
    expect(drawn[0]?.props).toMatchObject({ state: { unavailable: false } });
  });
});
