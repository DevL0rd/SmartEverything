import { HOME_MAP_CAMERA_FOV_DEFAULT, type HomeMapCamera } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import type { RenderFloor, RenderOpening, RenderPlacement, RenderRoom } from '../render-scene';
import { cameraPtz, heatBand, overlayModel, sourcePoseToHouse, sourceToHouse } from './model';
import {
  CAMERA_DIRECTION_UNKNOWN_TEXT,
  OPENING_OPEN_LEAF_DEG,
  TRACK_TRAIL_MS,
  type OverlayDeviceState,
  type OverlayInput,
  type OverlayReading,
} from './model-types';

const FLOOR_ID = 'floor-ground';
const SHELLY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CAMERA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CONTACT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const LOCK = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const LEAK = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const NOW = 1_000_000;

const room = (id: string, homeRoomId: string | null, x: number): RenderRoom => ({
  id,
  name: null,
  homeRoomId,
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

const camera = (extra: Partial<HomeMapCamera> = {}): HomeMapCamera => ({
  ...HOME_MAP_CAMERA_FOV_DEFAULT,
  fovSource: 'estimated',
  pan: { mode: 'fixed', yawDeg: 0, presets: { door: { yawDeg: 90, tiltDeg: -10 } } },
  showCone: true,
  ...extra,
});

const placement = (deviceId: string, extra: Partial<RenderPlacement> = {}): RenderPlacement => ({
  deviceId,
  name: null,
  kind: null,
  at: { x: 1, y: 1 },
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

const door = (extra: Partial<RenderOpening> = {}): RenderOpening => ({
  id: 'door',
  wallId: 'mid',
  from: { x: 4, y: 1 },
  to: { x: 4, y: 2 },
  kind: 'door',
  sourceKind: null,
  sillHeight: 0,
  headHeight: 2.1,
  hinge: 'left',
  swing: 'in',
  contactDeviceId: CONTACT,
  lockDeviceId: LOCK,
  roomIds: ['living', 'kitchen'],
  ...extra,
});

const floor = (extra: Partial<RenderFloor> = {}): RenderFloor => ({
  id: FLOOR_ID,
  name: 'Ground',
  level: 0,
  elevation: 0,
  ceilingHeight: 2.6,
  bounds: null,
  rooms: [room('living', 'home-living', 0), room('kitchen', null, 4)],
  walls: [
    {
      id: 'mid',
      from: { x: 4, y: -6 },
      to: { x: 4, y: 8 },
      thickness: 0.1,
      height: 2.6,
      kind: 'solid',
      exterior: false,
    },
  ],
  openings: [door()],
  objects: [],
  placements: [placement(SHELLY), placement(CAMERA, { camera: camera() })],
  carpets: [],
  markers: [],
  measures: [],
  vacuum: null,
  ...extra,
});

const reading = (amount: number, extra: Partial<OverlayReading> = {}): OverlayReading => ({
  amount,
  value: String(amount),
  unit: '°C',
  verdict: 'Good',
  tone: 'positive',
  stale: false,
  ...extra,
});

const input = (extra: Partial<OverlayInput> = {}): OverlayInput => ({
  floor: floor(),
  now: NOW,
  devices: new Map<string, OverlayDeviceState>(),
  climate: new Map(),
  sensors: [],
  trackingLease: false,
  vacuum: null,
  selectedDeviceId: null,
  showAllCameraViews: false,
  heatTint: false,
  animate: true,
  ...extra,
});

const shelly = {
  deviceId: SHELLY,
  zones: [
    { id: 'sofa', area: [[0, 0, 2, 2] as const], occupied: true },
    { id: 'desk', area: [[2, 0, 4, 2] as const], occupied: false },
  ],
  tracks: [
    {
      id: 't1',
      points: [
        { x: 0, y: 1, at: NOW - TRACK_TRAIL_MS - 1 },
        { x: 0, y: 1.5, at: NOW - TRACK_TRAIL_MS / 2 },
        { x: 0, y: 2, at: NOW },
      ],
    },
  ],
};

describe('presence and occupancy', () => {
  it('fills every zone with its occupied state, through the sensor placement', () => {
    const model = overlayModel(input({ sensors: [shelly] }));
    expect(model.zones.map((zone) => [zone.id, zone.occupied])).toEqual([
      ['sofa', true],
      ['desk', false],
    ]);
    expect(model.zones[0]?.polygons[0]?.outer).toHaveLength(4);
  });

  it('draws tracks only while a tracking lease is held', () => {
    expect(overlayModel(input({ sensors: [shelly] })).tracks).toEqual([]);
    const [track] = overlayModel(input({ sensors: [shelly], trackingLease: true })).tracks;
    expect(track?.head.x).toBeCloseTo(3);
    expect(track?.head.y).toBeCloseTo(1);
    expect(track?.ringM).toBeCloseTo(2);
    expect(track?.trail.map((point) => point.opacity)).toEqual([0.5, 1]);
  });

  it('skips sensors that are not placed on this floor', () => {
    const model = overlayModel(
      input({ floor: floor({ placements: [] }), sensors: [shelly], trackingLease: true }),
    );
    expect(model.zones).toEqual([]);
    expect(model.tracks).toEqual([]);
  });

  it('tints the room of an occupied or moving sensor and flashes the moving one', () => {
    const devices = new Map([[SHELLY, { online: true, motion: true }]]);
    const model = overlayModel(input({ devices }));
    expect(model.activeRooms).toEqual(['living']);
    expect(model.motionDevices).toEqual([SHELLY]);
  });
});

describe('climate', () => {
  it('shows temperature and PM2.5 chips for linked rooms, skipping stale readings', () => {
    const climate = new Map([
      ['home-living', { temperature: reading(22), pm25: reading(40, { stale: true }) }],
    ]);
    const [chip] = overlayModel(input({ climate })).climate;
    expect(chip?.roomId).toBe('living');
    expect(chip?.temperature?.amount).toBe(22);
    expect(chip?.pm25).toBeNull();
    expect(chip?.heat).toBeNull();
  });

  it('adds the heat tint only with a temperature chip, Fahrenheit converted', () => {
    const climate = new Map([['home-living', { temperature: reading(22), pm25: null }]]);
    expect(overlayModel(input({ climate, heatTint: true })).climate[0]?.heat).toBeCloseTo(0.5);
    const pmOnly = new Map([['home-living', { temperature: null, pm25: reading(12) }]]);
    expect(overlayModel(input({ climate: pmOnly, heatTint: true })).climate[0]?.heat).toBeNull();
    expect(heatBand(reading(71.6, { unit: '°F' }))).toBeCloseTo(0.5);
    expect(heatBand(reading(40))).toBe(1);
  });
});

describe('openings', () => {
  it('opens the leaf with a warning from the contact and shows the lock', () => {
    const devices = new Map([
      [CONTACT, { online: true, contactOpen: true }],
      [LOCK, { online: true, locked: true }],
    ]);
    expect(overlayModel(input({ devices })).openings).toEqual([
      { id: 'door', contact: 'open', leafDeg: OPENING_OPEN_LEAF_DEG, warning: true, locked: true },
    ]);
  });

  it('reports an unknown contact while the sensor is offline', () => {
    const devices = new Map([[CONTACT, { online: false, contactOpen: true }]]);
    const [opening] = overlayModel(input({ devices })).openings;
    expect(opening?.contact).toBe('unknown');
    expect(opening?.leafDeg).toBe(0);
    expect(opening?.locked).toBeNull();
  });
});

describe('vacuum', () => {
  const transform = { rotationDeg: 90, tx: 10, ty: 0, mirrored: false };
  const robot = { x: 1, y: 0, yawDeg: 0 };
  const trail = [{ mopping: false, points: [{ x: 0, y: 0 }] }];

  it('moves the robot, heading and trail through the source transform while working', () => {
    const model = overlayModel(
      input({ vacuum: { transform, working: true, robot, dock: robot, trail } }),
    );
    expect(model.vacuum?.robot?.x).toBeCloseTo(10);
    expect(model.vacuum?.robot?.y).toBeCloseTo(1);
    expect(model.vacuum?.robot?.yawDeg).toBeCloseTo(90);
    expect(model.vacuum?.trail[0]?.points[0]).toEqual({ x: 10, y: 0 });
    expect(model.vacuum?.live).toBe(true);
  });

  it('keeps the last pose and the dock without a trail while idle', () => {
    const model = overlayModel(
      input({ vacuum: { transform, working: false, robot, dock: robot, trail } }),
    );
    expect(model.vacuum?.robot).not.toBeNull();
    expect(model.vacuum?.dock).not.toBeNull();
    expect(model.vacuum?.trail).toEqual([]);
  });

  it('mirrors before rotating', () => {
    const mirrored = { rotationDeg: 0, tx: 0, ty: 0, mirrored: true };
    expect(sourceToHouse(mirrored, { x: 2, y: 3 })).toEqual({ x: -2, y: 3 });
    expect(sourcePoseToHouse(mirrored, { x: 0, y: 0, yawDeg: 30 }).yawDeg).toBeCloseTo(150);
  });
});

describe('cameras', () => {
  it('draws the cone of the selected camera only, clipped by the wall', () => {
    expect(overlayModel(input()).cameras).toEqual([]);
    const [cone] = overlayModel(input({ selectedDeviceId: CAMERA })).cameras;
    expect(cone?.faint).toBe(false);
    expect(cone?.dashed).toBe(false);
    expect(Math.max(...(cone?.view.polygon ?? []).map((point) => point.x))).toBeLessThanOrEqual(
      4 + 1e-6,
    );
  });

  it('sees through the door while its contact is open', () => {
    const devices = new Map([[CONTACT, { online: true, contactOpen: true }]]);
    const [cone] = overlayModel(input({ devices, selectedDeviceId: CAMERA })).cameras;
    expect(Math.max(...(cone?.view.polygon ?? []).map((point) => point.x))).toBeGreaterThan(4.5);
  });

  it('draws every cone faintly when all camera views are shown', () => {
    const [cone] = overlayModel(input({ showAllCameraViews: true })).cameras;
    expect(cone?.faint).toBe(true);
  });

  it('follows the stored preset and dashes after a relative move', () => {
    const placements = [
      placement(CAMERA, { camera: camera({ pan: { ...camera().pan, mode: 'presets' } }) }),
    ];
    const at = (moveUncertain: boolean): OverlayInput =>
      input({
        floor: floor({ placements }),
        selectedDeviceId: CAMERA,
        devices: new Map([
          [CAMERA, { online: true, ptz: { preset: 'door', live: null, moveUncertain } }],
        ]),
      });
    expect(overlayModel(at(false)).cameras[0]?.view.direction.yawDeg).toBe(90);
    const moved = overlayModel(at(true)).cameras[0];
    expect(moved?.dashed).toBe(true);
    expect(moved?.note).toBe(CAMERA_DIRECTION_UNKNOWN_TEXT);
  });

  it('ignores a reported angle for a model with no proven angle', () => {
    const ptz = { preset: null, live: { yawDeg: 45, tiltDeg: 0 }, moveUncertain: false };
    expect(cameraPtz({ online: true, model: 'xiaomi.camera.083ae2', ptz }).live).toBeNull();
  });
});

describe('alerts and badges', () => {
  it('pulses a leak room only while animation is allowed', () => {
    const floorWithLeak = floor({ placements: [placement(LEAK, { roomId: 'kitchen' })] });
    const devices = new Map([[LEAK, { online: true, alert: 'leak' as const }]]);
    expect(overlayModel(input({ floor: floorWithLeak, devices })).alerts).toEqual([
      { deviceId: LEAK, roomId: 'kitchen', kind: 'leak', pulse: true },
    ]);
    expect(
      overlayModel(input({ floor: floorWithLeak, devices, animate: false })).alerts[0]?.pulse,
    ).toBe(false);
  });

  it('greys offline devices and marks low battery', () => {
    const devices = new Map([
      [SHELLY, { online: false }],
      [CAMERA, { online: true, batteryLow: true }],
    ]);
    expect(overlayModel(input({ devices })).badges).toEqual([
      { deviceId: SHELLY, offline: true, lowBattery: false },
      { deviceId: CAMERA, offline: false, lowBattery: true },
    ]);
  });
});
