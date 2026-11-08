import { describe, expect, it, vi } from 'vitest';
import type { ShellyDevice, ShellyTrack, ShellyZone } from '@smarteverything/shelly';
import type {
  RenderFloor,
  RenderPlacement,
  RenderRoom,
  RenderWall,
} from '../../components/house-map/render-scene';
import type { StageLiveProps } from '../../components/house-map/live-visibility/stage-host';
import type { StageContext } from '../../features/home-map/components/stage/stage';
import { TRACK_TRAIL_MS } from '../../components/house-map/overlays/model-types';
import { presenceFixture } from './presence-fixture';
import {
  NO_TRACK_HISTORY,
  SENSOR_VIEWS,
  advanceTrackHistory,
  coverageCone,
  describeSensorMap,
  focusBounds,
  sensorMapView,
  sensorSpot,
  sensorStageContent,
  sensorTrackDraws,
  sensorZoneShapes,
} from './presence-map';
import { PresencePageHero } from './presence-page';
import { SensorStageBody } from './presence-stage';

const SENSOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const room = (id: string, x: number, name: string | null = null): RenderRoom => ({
  id,
  name,
  homeRoomId: null,
  polygons: [
    {
      outer: [
        { x, y: 0 },
        { x: x + 4, y: 0 },
        { x: x + 4, y: 4 },
        { x, y: 4 },
      ],
      holes: [],
    },
  ],
  labelAt: { x: x + 2, y: 2 },
  colourSlot: 1,
  floor: { status: 'none' },
  wallPaint: null,
  ceilingHeight: 2.6,
  areaM2: 16,
  hidden: false,
});

const placement = (extra: Partial<RenderPlacement> = {}): RenderPlacement => ({
  deviceId: SENSOR,
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
  ...extra,
});

const wall = (id: string, x: number): RenderWall => ({
  id,
  from: { x, y: -10 },
  to: { x, y: 10 },
  thickness: 0.1,
  height: 2.6,
  kind: 'solid',
  exterior: false,
});

const floor = (
  id: string,
  placements: readonly RenderPlacement[],
  walls: readonly RenderWall[] = [],
): RenderFloor => ({
  id,
  name: id,
  level: 0,
  elevation: 0,
  ceilingHeight: 2.6,
  bounds: { minX: 0, minY: 0, maxX: 8, maxY: 4 },
  rooms: [room('living', 0, 'Living room'), room('office', 4)],
  walls,
  openings: [],
  objects: [],
  placements,
  carpets: [],
  markers: [],
  measures: [],
  vacuum: null,
});

const zone = (key: string, main: boolean, extra: Partial<ShellyZone>): ShellyZone => ({
  key,
  externalId: `shelly-presence:radar-1:${key}`,
  generation: 0,
  main,
  config: { id: 1, enable: true, area: [[0, 0, 2, 4]] },
  status: { id: 1, value: false, num_objects: 0 },
  ...extra,
});

const sensorWith = (zones: readonly ShellyZone[]): ShellyDevice => ({
  ...presenceFixture(),
  zones: [...zones],
});

const near = (value: number, expected: number): void => {
  expect(value).toBeCloseTo(expected, 9);
};

describe('sensorSpot', () => {
  it('finds the placement on any floor with its room and pose', () => {
    const spot = sensorSpot([floor('ground', []), floor('upper', [placement()])], SENSOR);
    expect(spot?.floor.id).toBe('upper');
    expect(spot?.room?.id).toBe('living');
    expect(spot?.pose).toEqual({ at: { x: 0, y: 2 }, yawDeg: 0 });
  });

  it('is null while the sensor is not placed', () => {
    expect(sensorSpot([floor('ground', [])], SENSOR)).toBeNull();
  });
});

describe('coverageCone', () => {
  it('opens along the sensor heading and stops at walls', () => {
    const open = sensorSpot([floor('g', [placement()])], SENSOR);
    const walled = sensorSpot([floor('g', [placement()], [wall('w', 3)])], SENSOR);
    if (open === null || walled === null) throw new Error('not placed');
    const reach = (points: readonly { readonly x: number }[]): number =>
      Math.max(...points.map((point) => point.x));
    expect(reach(coverageCone(open))).toBeCloseTo(8, 2);
    expect(reach(coverageCone(walled))).toBeLessThanOrEqual(3 + 1e-9);
    expect(Math.min(...coverageCone(open).map((point) => point.x))).toBeGreaterThanOrEqual(-1e-9);
  });
});

describe('sensorZoneShapes', () => {
  it('maps zone cells to house polygons through the sensor pose (R1 V6)', () => {
    const sensor = sensorWith([zone('presencezone:201', false, {})]);
    const [shape] = sensorZoneShapes(sensor, { at: { x: 5, y: 5 }, yawDeg: 0 });
    const outer = shape?.polygons[0]?.outer ?? [];
    const expected = [
      { x: 5, y: 5 },
      { x: 5, y: 4 },
      { x: 7, y: 4 },
      { x: 7, y: 5 },
    ];
    expected.forEach((point, index) => {
      near(outer[index]?.x ?? Number.NaN, point.x);
      near(outer[index]?.y ?? Number.NaN, point.y);
    });
  });

  it('draws the main area first, skips empty areas and marks occupancy', () => {
    const sensor = sensorWith([
      zone('presencezone:201', false, { status: { id: 1, value: true, num_objects: 1 } }),
      zone('presencezone:202', false, { config: { id: 2, enable: true, area: [] } }),
      zone('presencezone:200', true, {}),
      zone('presencezone:203', false, {
        config: { id: 3, enable: false, area: [[0, 0, 1, 1]] },
        status: { id: 3, value: true, num_objects: 1 },
      }),
    ]);
    const shapes = sensorZoneShapes(sensor, { at: { x: 0, y: 0 }, yawDeg: 90 });
    expect(shapes.map((shape) => [shape.key, shape.occupied])).toEqual([
      ['presencezone:200', false],
      ['presencezone:201', true],
      ['presencezone:203', false],
    ]);
  });
});

describe('focusBounds', () => {
  it('frames the sensor room, or the cone when the sensor has no room', () => {
    const inRoom = sensorSpot([floor('g', [placement()])], SENSOR);
    const loose = sensorSpot([floor('g', [placement({ roomId: null })])], SENSOR);
    if (inRoom === null || loose === null) throw new Error('not placed');
    expect(focusBounds(inRoom, coverageCone(inRoom))).toEqual({
      minX: 0,
      minY: 0,
      maxX: 4,
      maxY: 4,
    });
    expect(focusBounds(loose, coverageCone(loose)).maxX).toBeCloseTo(8, 2);
  });
});

describe('track history', () => {
  const at = (ms: number): string => new Date(ms).toISOString();
  const track = (x: number, y: number): ShellyTrack => ({ id: 1, x, y, z: 1 });

  it('keeps a 10 s trail from message timestamps and resets without a lease', () => {
    const first = advanceTrackHistory(NO_TRACK_HISTORY, { at: at(0), tracks: [track(0, 1)] }, true);
    const same = advanceTrackHistory(first, { at: at(0), tracks: [track(0, 1)] }, true);
    expect(same).toBe(first);
    const second = advanceTrackHistory(first, { at: at(4000), tracks: [track(0, 2)] }, true);
    expect(second.tracks[0]?.points.map((point) => point.y)).toEqual([1, 2]);
    const late = advanceTrackHistory(
      second,
      { at: at(TRACK_TRAIL_MS + 2000), tracks: [track(0, 3)] },
      true,
    );
    expect(late.tracks[0]?.points.map((point) => point.y)).toEqual([2, 3]);
    expect(advanceTrackHistory(late, { at: at(0), tracks: [] }, false)).toBe(NO_TRACK_HISTORY);
  });

  it('draws tracks in the house frame only while the lease is held', () => {
    const spot = sensorSpot(
      [floor('g', [placement({ rotationDeg: 90, at: { x: 0, y: 0 } })])],
      SENSOR,
    );
    if (spot === null) throw new Error('not placed');
    const history = advanceTrackHistory(
      NO_TRACK_HISTORY,
      { at: at(1000), tracks: [track(1, 0)] },
      true,
    );
    expect(sensorTrackDraws(spot, history, false)).toEqual([]);
    const [draw] = sensorTrackDraws(spot, history, true);
    near(draw?.head.x ?? Number.NaN, 1);
    near(draw?.head.y ?? Number.NaN, 0);
    near(draw?.ringM ?? Number.NaN, 1);
  });
});

describe('sensorMapView', () => {
  it('builds the view for a placed sensor and describes it', () => {
    const sensor = sensorWith([
      zone('presencezone:200', true, {}),
      zone('presencezone:201', false, { status: { id: 1, value: true, num_objects: 1 } }),
    ]);
    const view = sensorMapView([floor('g', [placement()])], sensor, SENSOR);
    if (view === null) throw new Error('not placed');
    expect(view.zones).toHaveLength(2);
    expect(describeSensorMap(view, 'Radar', 1)).toBe(
      'Radar in Living room, coverage cone, 1 zone, 1 occupied, 1 person tracked live',
    );
    expect(sensorMapView([floor('g', [])], sensor, SENSOR)).toBeNull();
  });
});

describe('presence page hero', () => {
  it('loads with the map stage modules', () => {
    expect(PresencePageHero).toBeTypeOf('function');
  });
});

describe('sensorStageContent', () => {
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

  it('offers the 3D map as the only sensor view', () => {
    expect(SENSOR_VIEWS.map((option) => option.value)).toEqual(['3d']);
  });

  it('keeps the stage live with its still and draws the sensor on the 3D map', () => {
    const view = sensorMapView([floor('g', [placement()])], sensorWith([]), SENSOR);
    if (view === null) throw new Error('not placed');
    const content = sensorStageContent({
      view,
      stageId: 'shelly-page:radar',
      label: 'Radar in Living room',
      dimmed: true,
      shown: 'realistic',
    });
    expect(content).toMatchObject({ kind: 'live', id: 'shelly-page:radar' });
    if (content.kind !== 'live') throw new Error('The sensor stage must stay live');
    expect(content.render(context, live)).toMatchObject({
      type: SensorStageBody,
      props: {
        input: { view, label: 'Radar in Living room', dimmed: true, shown: 'realistic' },
        context,
        live,
      },
    });
  });
});
