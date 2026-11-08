import {
  HOME_MAP_CLIENT_PREFS,
  type DeviceCapability,
  type DeviceKind,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { floorOf, placement } from '../../../components/house-map/lighting-fixture';
import type { OverlayDeviceState } from '../../../components/house-map/overlays/model-types';
import type { RenderFloor, RenderOpening } from '../../../components/house-map/render-scene';
import { deviceFixture } from '../../../store/device-fixture';
import type { DeviceValues } from '../../../store/state';
import { deviceModelOf } from '../../devices';
import { buildHomeMapLive, liveFactsOf, type LiveFacts, type LiveSource } from './live-feed-inputs';

const LOOK = HOME_MAP_CLIENT_PREFS.home_map_look.defaultValue;
const STAMP = '2026-10-16T08:00:00.000Z';

const boolean = (key: DeviceCapability['key']): DeviceCapability => ({
  key,
  label: key,
  access: 'read',
  value: { kind: 'boolean' },
});

const writable = (key: DeviceCapability['key']): DeviceCapability => ({
  ...boolean(key),
  access: 'read_write',
});

const level = (key: DeviceCapability['key'], max: number, unit: string): DeviceCapability => ({
  key,
  label: key,
  access: 'read',
  value: { kind: 'number', min: 0, max, step: 1, unit },
});

function source(
  id: string,
  kind: DeviceKind,
  capabilities: readonly DeviceCapability[],
  values: Readonly<Record<string, boolean | number | string>>,
): LiveSource {
  const stamped: DeviceValues = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, { value, observedAt: STAMP }]),
  );
  return {
    model: deviceModelOf(deviceFixture(1, { id, kind, capabilities: [...capabilities] })),
    values: stamped,
  };
}

const lamp = (id: string, on: boolean): LiveSource =>
  source(id, 'light', [writable('power')], { power: on });

const door = (id: string, open: boolean): LiveSource =>
  source(id, 'sensor', [boolean('contact')], { contact: open });

const presence = (id: string, occupied: boolean): LiveSource =>
  source(id, 'sensor', [boolean('occupancy')], { occupancy: occupied });

const TEMPERATURE = {
  metric: 'temperature',
  label: 'Temperature',
  amount: 21.4,
  value: '21.4',
  unit: '°C',
  verdict: 'Comfortable',
  tone: 'positive',
  stale: false,
} as const;

function floorWith(openings: readonly RenderOpening[] = []): RenderFloor {
  const base = floorOf([
    placement('lamp-1', 1, 2, { roomId: 'kitchen' }),
    placement('lamp-2', 5, 2, { roomId: 'hall' }),
    placement('presence-1', 6, 2, { roomId: 'hall', kind: 'sensor' }),
    placement('door-1', 4, 2, { kind: 'sensor' }),
  ]);
  return {
    ...base,
    rooms: base.rooms.map((room) => ({
      ...room,
      homeRoomId: room.id === 'kitchen' ? 'home-kitchen' : null,
    })),
    openings,
  };
}

const OPENING: RenderOpening = {
  id: 'opening-1',
  wallId: null,
  from: { x: 4, y: 1 },
  to: { x: 4, y: 2 },
  kind: 'door',
  sourceKind: null,
  sillHeight: 0,
  headHeight: 2,
  hinge: 'left',
  swing: 'in',
  contactDeviceId: 'door-1',
  lockDeviceId: null,
  roomIds: [],
};

function facts(overrides: Partial<LiveFacts> = {}): LiveFacts {
  return {
    ...liveFactsOf(
      [
        lamp('lamp-1', true),
        lamp('lamp-2', false),
        door('door-1', true),
        presence('presence-1', true),
      ],
      { 'home-kitchen': [TEMPERATURE] },
    ),
    ...overrides,
  };
}

describe('liveFactsOf', () => {
  it('reads contact, occupancy and lights from device values', () => {
    const read = facts();
    expect(read.devices['door-1']?.contactOpen).toBe(true);
    expect(read.devices['presence-1']?.occupied).toBe(true);
    expect(read.lights['lamp-1']?.on).toBe(true);
    expect(read.lights['lamp-2']?.on).toBe(false);
    expect(read.lights['door-1']).toBeUndefined();
  });

  it('marks a low battery and an alert', () => {
    const sensor = source('s', 'sensor', [level('battery', 100, '%'), boolean('leak')], {
      battery: 12,
      leak: true,
    });
    const state: OverlayDeviceState | undefined = liveFactsOf([sensor], {}).devices['s'];
    expect(state?.batteryLow).toBe(true);
    expect(state?.alert).toBe('leak');
  });
});

describe('buildHomeMapLive', () => {
  it('lights the rooms of lights that are on', () => {
    const live = buildHomeMapLive(floorWith(), LOOK, facts());
    expect(live.lighting.enabled).toBe(true);
    expect(live.lighting.rooms.map((room) => room.roomId)).toEqual(['kitchen']);
  });

  it('turns the lighting off with the lightUp flag but still reports lights in the summary', () => {
    const live = buildHomeMapLive(floorWith(), { ...LOOK, lightUp: false }, facts(), {
      mapName: 'Home',
    });
    expect(live.lighting.enabled).toBe(false);
    expect(live.lighting.rooms).toEqual([]);
    expect(live.summary).toContain('lights on in Kitchen');
  });

  it('draws the opening state of a door sensor and hides it with showOpeningState', () => {
    const shown = buildHomeMapLive(floorWith([OPENING]), LOOK, facts());
    expect(shown.overlay.openings[0]?.contact).toBe('open');
    const hidden = buildHomeMapLive(
      floorWith([OPENING]),
      { ...LOOK, showOpeningState: false },
      facts(),
    );
    expect(hidden.overlay.openings).toEqual([]);
  });

  it('tracks occupancy per room and hides it with showPeople', () => {
    const shown = buildHomeMapLive(floorWith(), LOOK, facts());
    expect(shown.overlay.activeRooms).toEqual(['hall']);
    const hidden = buildHomeMapLive(floorWith(), { ...LOOK, showPeople: false }, facts());
    expect(hidden.overlay.activeRooms).toEqual([]);
    expect(hidden.summary).not.toContain('person');
  });

  it('follows roomClimate: chip, tint and off', () => {
    const chip = buildHomeMapLive(floorWith(), LOOK, facts());
    expect(chip.overlay.climate).toHaveLength(1);
    expect(chip.overlay.climate[0]?.heat).toBeNull();
    const tint = buildHomeMapLive(floorWith(), { ...LOOK, roomClimate: 'chip_tint' }, facts());
    expect(tint.overlay.climate[0]?.heat).not.toBeNull();
    const off = buildHomeMapLive(floorWith(), { ...LOOK, roomClimate: 'off' }, facts());
    expect(off.overlay.climate).toEqual([]);
  });

  it('hides the robot with showRobot', () => {
    const vacuum = {
      transform: { rotationDeg: 0, tx: 0, ty: 0, mirrored: false },
      working: true,
      robot: { x: 1, y: 1, yawDeg: 0 },
      dock: null,
      trail: [],
    };
    expect(buildHomeMapLive(floorWith(), LOOK, facts(), { vacuum }).overlay.vacuum).not.toBeNull();
    expect(
      buildHomeMapLive(floorWith(), { ...LOOK, showRobot: false }, facts(), { vacuum }).overlay
        .vacuum,
    ).toBeNull();
  });

  it('words the summary for two rooms', () => {
    const live = buildHomeMapLive(floorWith(), LOOK, facts(), { mapName: 'Flat' });
    expect(live.summary).toBe(
      'Flat map, Ground, 2 rooms, lights on in Kitchen, 1 person in Hall, 21.4 degrees in Kitchen',
    );
  });
});
