import { HOME_MAP_WALL_ID } from '@smarteverything/domain';
import { LineDashedMaterial, Mesh, MeshBasicMaterial, Object3D, type Group } from 'three';
import { describe, expect, it } from 'vitest';
import { floorLighting } from '../lighting';
import { floorOf, input, ON, placement } from '../lighting-fixture';
import type { OverlayCameraDraw, OverlayModel } from '../overlays/model-types';
import type { RenderFloor, RenderOpening } from '../render-scene';
import type { GlowDecalFactory } from './light-pools';
import { climateText, climateTone } from '../climate-text';
import {
  createOverlayLayer,
  OVERLAY_LOOKS,
  OVERLAY_OPACITY,
  type OverlayUpdate,
  type Seen,
} from './overlays';

const ALL: Seen = () => true;

const NONE: Seen = () => false;

const decals = (): GlowDecalFactory => ({
  create: (_surface, name): ReturnType<GlowDecalFactory['create']> => {
    const mesh = new Object3D();
    mesh.name = name;
    return { mesh, apply: (): void => undefined, dispose: (): void => undefined };
  },
  dispose: (): void => undefined,
});

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
  wallId: 'w1',
  from: { x: 4, y: 1 },
  to: { x: 4, y: 2 },
  kind: 'door',
  sourceKind: null,
  sillHeight: 0,
  headHeight: 2,
  hinge: 'left',
  swing: 'in',
  contactDeviceId: 'contact',
  lockDeviceId: 'lock',
  roomIds: ['kitchen', 'hall'],
};

const sensors = [
  placement('shelly', 1, 1, { kind: 'sensor', mount: 'wall' }),
  placement('cam', 7, 3, { kind: 'camera', height: 2.2 }),
  placement('leak', 2, 3, { kind: 'sensor', roomId: 'kitchen' }),
];

const FLOOR: RenderFloor = { ...floorOf(sensors), openings: [door] };

const update = (
  model: Partial<OverlayModel>,
  extra: Partial<OverlayUpdate> = {},
): OverlayUpdate => ({
  floor: FLOOR,
  model: {
    ...EMPTY,
    ...model,
    climate: (model.climate ?? []).map((chip) => ({
      ...{ roomId: chip.roomId, at: chip.at, heat: chip.heat },
      ...{ text: climateText(chip), tone: climateTone(chip) },
    })),
  },
  lighting: null,
  realDeviceIds: new Set(),
  theme: 'light',
  ...extra,
});

const part = (layer: { group: Group }, name: string): Object3D => {
  const found = layer.group.getObjectByName(`overlay:${name}`);
  if (found === undefined) throw new Error(`missing ${name}`);
  return found;
};

const names = (layer: { group: Group }, name: string): readonly string[] =>
  part(layer, name).children.map((child) => child.name);

const materialOf = (object: Object3D | undefined): MeshBasicMaterial => {
  if (object instanceof Mesh && object.material instanceof MeshBasicMaterial)
    return object.material;
  throw new Error('not a basic mesh');
};

const track = {
  deviceId: 'shelly',
  id: 't1',
  head: { x: 3, y: 1 },
  trail: [
    { x: 2, y: 1, opacity: 0.5 },
    { x: 3, y: 1, opacity: 1 },
  ],
  ringM: 2,
};

const camera = (dashed: boolean, faint: boolean): OverlayCameraDraw => ({
  deviceId: 'cam',
  faint,
  dashed,
  note: null,
  view: {
    direction: { yawDeg: 180, tiltDeg: 0, known: !dashed },
    polygon: [],
    dashed,
    frustum: {
      apex: { x: 7, y: 3, z: 2.2 },
      direction: { yawDeg: 180, tiltDeg: 0, known: !dashed },
      ring: [
        { x: 7, y: 3 },
        { x: 5, y: 1 },
        { x: 5, y: 4 },
      ],
      floorM: 0,
      topM: 2.2,
    },
  },
});

describe('3d overlay layer', () => {
  it('asks for a frame only when a live message changes something, rebuilding only its part', () => {
    const layer = createOverlayLayer(decals);
    const square = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    const zone = {
      id: 'z1',
      deviceId: 'shelly',
      occupied: true,
      polygons: [{ outer: square, holes: [] }],
    };
    const first = update({ tracks: [track], zones: [zone], activeRooms: ['kitchen'] });
    expect(layer.update(first)).toBe(true);
    expect(layer.update({ ...first, model: { ...first.model } })).toBe(false);
    const presence = part(layer, 'presence').children[0];
    const moved = { ...track, head: { x: 3.5, y: 1 } };
    expect(layer.update(update({ tracks: [moved], zones: [zone], activeRooms: ['kitchen'] }))).toBe(
      true,
    );
    expect(part(layer, 'presence').children[0]).toBe(presence);
    expect(layer.update({ ...first, floor: { ...FLOOR } })).toBe(true);
    expect(part(layer, 'presence').children[0]).not.toBe(presence);
    layer.dispose();
  });

  it('draws track dots and their fading trail without distance rings', () => {
    const layer = createOverlayLayer(decals);
    layer.update(update({ tracks: [track] }));
    expect(names(layer, 'tracks')).toEqual([
      'track-trail:t1:0',
      'track-trail:t1:1',
      'track-halo:t1',
      'track:t1',
    ]);
    const children = part(layer, 'tracks').children;
    expect(materialOf(children[0]).opacity).toBeCloseTo(0.5 * OVERLAY_OPACITY.trail);
    expect(names(layer, 'tracks').some((name) => name.startsWith('track-ring:'))).toBe(false);
    layer.dispose();
  });

  it('lifts motion glows and track dots just above a raised floor', () => {
    const layer = createOverlayLayer(decals);
    const raised = { ...FLOOR, elevation: 2.8 };
    layer.update(update({ tracks: [track], motionDevices: ['shelly'] }, { floor: raised }));
    const heights = [...part(layer, 'presence').children, ...part(layer, 'tracks').children].map(
      (child) => child.position.y,
    );
    expect(heights).toHaveLength(5);
    for (const height of heights) {
      expect(height).toBeGreaterThan(2.8);
      expect(height).toBeLessThan(3);
    }
    layer.dispose();
  });

  it('extrudes the camera visibility polygon to the camera height, dashed and faint when asked', () => {
    const layer = createOverlayLayer(decals);
    layer.update(update({ cameras: [camera(false, false)] }));
    expect(names(layer, 'cameras')).toEqual([
      'frustum-floor:cam',
      'frustum-sides:cam',
      'frustum-edge:cam',
      'frustum-top:cam',
    ]);
    const bright = materialOf(part(layer, 'cameras').children[0]).opacity;
    layer.update(update({ cameras: [camera(true, true)] }));
    const edges = part(layer, 'cameras').children[2];
    expect(edges && 'material' in edges ? edges.material : null).toBeInstanceOf(LineDashedMaterial);
    expect(materialOf(part(layer, 'cameras').children[0]).opacity).toBeCloseTo(
      bright * OVERLAY_OPACITY.faint,
    );
    layer.dispose();
  });

  it('turns an open door leaf with the warning edge and the lock badge, rebuilding on change only', () => {
    const layer = createOverlayLayer(decals);
    const opening = {
      id: 'door',
      contact: 'open' as const,
      leafDeg: 70,
      warning: true,
      locked: false,
    };
    expect(layer.update(update({ openings: [opening] }))).toBe(true);
    const live = layer.group.getObjectByName('openings-live');
    expect(live?.children.map((child) => child.name)).toEqual(['opening:door:0', 'lock:door']);
    expect(live?.children[0]?.rotation.y).toBeCloseTo(((90 - 70) * Math.PI) / 180);
    expect(layer.update(update({ openings: [{ ...opening }] }))).toBe(false);
    layer.update(update({ openings: [{ ...opening, contact: 'closed', locked: null }] }));
    expect(live?.children.map((child) => child.rotation.y)).toEqual([Math.PI / 2]);
    layer.dispose();
  });

  it('pulses a changed opening once for about 600 ms and then stops asking for frames', () => {
    const layer = createOverlayLayer(decals);
    const closed = {
      id: 'door',
      contact: 'closed' as const,
      leafDeg: 0,
      warning: false,
      locked: null,
    };
    const open = { ...closed, contact: 'open' as const, leafDeg: 70, warning: true };
    const rings = layer.group.getObjectByName('opening-pulses');
    expect(layer.motion(true)).toBe(false);
    layer.update(update({ openings: [open] }));
    expect(rings?.children).toHaveLength(0);
    expect(layer.animating(ALL)).toBe(false);
    layer.update(update({ openings: [open] }, { floor: { ...FLOOR } }));
    expect(rings?.children).toHaveLength(0);
    expect(layer.update(update({ openings: [closed] }))).toBe(true);
    expect(rings?.children.map((child) => child.name)).toEqual(['opening-pulse:door']);
    expect(layer.animating(ALL)).toBe(true);
    expect(layer.tick(1000, ALL)).toBe(true);
    expect(layer.tick(1300, ALL)).toBe(true);
    expect(materialOf(rings?.children[0]).opacity).toBeCloseTo(OVERLAY_OPACITY.alert / 2);
    expect(layer.tick(1600, ALL)).toBe(true);
    expect(rings?.children).toHaveLength(0);
    expect(layer.animating(ALL)).toBe(false);
    expect(layer.tick(1700, ALL)).toBe(false);
    layer.dispose();
  });

  it('never pulses while motion is off and drops a running pulse when the stage hides', () => {
    const layer = createOverlayLayer(decals);
    const closed = {
      id: 'door',
      contact: 'closed' as const,
      leafDeg: 0,
      warning: false,
      locked: null,
    };
    const open = { ...closed, contact: 'open' as const, leafDeg: 70, warning: true };
    const rings = layer.group.getObjectByName('opening-pulses');
    layer.update(update({ openings: [closed] }));
    layer.update(update({ openings: [open] }));
    expect(rings?.children).toHaveLength(0);
    expect(layer.motion(true)).toBe(false);
    expect(rings?.children).toHaveLength(0);
    expect(layer.animating(ALL)).toBe(false);
    layer.update(update({ openings: [closed] }));
    expect(rings?.children).toHaveLength(1);
    expect(layer.motion(false)).toBe(true);
    expect(rings?.children).toHaveLength(0);
    expect(layer.animating(ALL)).toBe(false);
    layer.update(update({ openings: [open] }));
    expect(layer.motion(true)).toBe(false);
    expect(layer.tick(2000, ALL)).toBe(false);
    expect(rings?.children).toHaveLength(0);
    layer.dispose();
  });

  it('draws one leaf set and one lock badge per opening', () => {
    const layer = createOverlayLayer(decals);
    const open = { id: 'door', contact: 'open' as const, leafDeg: 70, warning: true, locked: true };
    layer.update(update({ openings: [open] }));
    const named = (pattern: RegExp): number => {
      let count = 0;
      layer.group.traverse((child) => {
        if (pattern.test(child.name)) count += 1;
      });
      return count;
    };
    expect(named(/^opening:door(:\d+)?$/)).toBe(1);
    expect(named(/^lock:door$/)).toBe(1);
    expect(layer.group.getObjectByName('overlay:openings')).toBeUndefined();
    layer.dispose();
  });

  it('draws dotted stems for wall attachments only above cut walls', () => {
    const layer = createOverlayLayer(decals);
    const wall = {
      id: 'w1',
      from: { x: 0, y: 0 },
      to: { x: 4, y: 0 },
      thickness: 0.1,
      height: 2.5,
      kind: 'solid' as const,
      exterior: false,
    };
    const ac = placement('ac', 1, 0.05, { height: 2.15, mount: 'wall' });
    const floor: RenderFloor = {
      ...FLOOR,
      walls: [wall],
      placements: [
        ...FLOOR.placements,
        { ...ac, wall: { wallId: HOME_MAP_WALL_ID.parse('w1'), offset: 1, side: 'left' } },
      ],
    };
    const cutaway = { style: 'cutaway' as const, cutIds: new Set(['w1']), lowHeight: 1 };
    expect(layer.walls(cutaway)).toBe(false);
    expect(layer.update(update({}, { floor }))).toBe(true);
    const stems = layer.group.getObjectByName('wall-stems');
    expect(stems?.children.map((child) => child.name)).toEqual(['stem:ac', 'stem-foot:ac']);
    expect(layer.walls({ ...cutaway, cutIds: new Set(['w1']) })).toBe(false);
    expect(layer.walls({ ...cutaway, cutIds: new Set() })).toBe(true);
    expect(stems?.children).toHaveLength(0);
    layer.dispose();
  });

  it('pulses alert rooms only while the model allows motion', () => {
    const layer = createOverlayLayer(decals);
    const alert = { deviceId: 'leak', roomId: 'kitchen', kind: 'leak' as const, pulse: true };
    layer.motion(true);
    layer.update(update({ alerts: [alert] }));
    expect(names(layer, 'alerts')).toEqual(['alert:leak', 'alert-glow:leak']);
    expect(layer.animating(ALL)).toBe(true);
    layer.tick(800, ALL);
    const room = materialOf(part(layer, 'alerts').children[0]);
    expect(room.opacity).toBeLessThan(OVERLAY_OPACITY.alert);
    layer.update(update({ alerts: [{ ...alert, pulse: false }] }));
    expect(layer.animating(ALL)).toBe(false);
    expect(layer.tick(800, ALL)).toBe(false);
    expect(materialOf(part(layer, 'alerts').children[0]).opacity).toBe(OVERLAY_OPACITY.alert);
    layer.dispose();
  });

  it('holds alert pulses still with reduced motion and asks for frames only while one is seen', () => {
    const layer = createOverlayLayer(decals);
    const alert = { deviceId: 'leak', roomId: 'kitchen', kind: 'leak' as const, pulse: true };
    layer.update(update({ alerts: [alert] }));
    const room = (): MeshBasicMaterial => materialOf(part(layer, 'alerts').children[0]);
    expect(layer.animating(ALL)).toBe(false);
    expect(layer.tick(800, ALL)).toBe(false);
    expect(room().opacity).toBe(OVERLAY_OPACITY.alert);
    layer.motion(true);
    expect(layer.animating(NONE)).toBe(false);
    expect(layer.tick(800, NONE)).toBe(false);
    expect(layer.tick(800, ALL)).toBe(true);
    expect(room().opacity).toBeLessThan(OVERLAY_OPACITY.alert);
    expect(layer.motion(false)).toBe(true);
    expect(room().opacity).toBe(OVERLAY_OPACITY.alert);
    expect(layer.animating(ALL)).toBe(false);
    part(layer, 'alerts').visible = false;
    layer.motion(true);
    const hidden = (object: Parameters<Seen>[0]): boolean => {
      for (let node: typeof object | null = object; node !== null; node = node.parent) {
        if (!node.visible) return false;
      }
      return true;
    };
    expect(layer.animating(hidden)).toBe(false);
    layer.dispose();
  });

  it('merges any number of light pools per room and hides them when lighting is off', () => {
    const layer = createOverlayLayer(decals);
    const lamps = Array.from({ length: 30 }, (_, index) =>
      placement(`l${String(index)}`, 0.5 + (index % 7) * 0.5, 1),
    );
    const lighting = floorLighting(
      input(lamps, Object.fromEntries(lamps.map((lamp) => [lamp.deviceId, ON]))),
    );
    expect(layer.update(update({}, { lighting }))).toBe(true);
    const pools = layer.group.getObjectByName('light-pools');
    expect(pools?.children.filter((child) => child.name.startsWith('light-pool:'))).toHaveLength(1);
    expect(pools?.children.filter((child) => child.name.startsWith('ceiling-glow:'))).toHaveLength(
      30,
    );
    expect(layer.update(update({}, { lighting: null }))).toBe(true);
    expect(pools?.visible).toBe(false);
    expect(layer.update(update({}, { lighting: null }))).toBe(false);
    layer.dispose();
  });

  it('draws heat tints, offline and battery dots and the robot through the house frame', () => {
    const layer = createOverlayLayer(decals);
    layer.update(
      update({
        climate: [{ roomId: 'hall', at: { x: 6, y: 2 }, temperature: null, pm25: null, heat: 1 }],
        badges: [{ deviceId: 'cam', offline: true, lowBattery: true }],
        vacuum: {
          robot: { x: 2, y: 2, yawDeg: 90 },
          dock: { x: 0.2, y: 0.2, yawDeg: 0 },
          trail: [
            {
              mopping: false,
              points: [
                { x: 1, y: 1 },
                { x: 2, y: 2 },
              ],
            },
          ],
          live: true,
        },
      }),
    );
    expect(`#${materialOf(part(layer, 'heat').children[0]).color.getHexString()}`).toBe(
      OVERLAY_LOOKS.light.warm,
    );
    expect(names(layer, 'badges')).toEqual(['offline:cam', 'battery:cam']);
    expect(part(layer, 'badges').children[0]?.position.y).toBeCloseTo(2.2 + 0.18);
    expect(names(layer, 'vacuum')).toEqual(['trail-sweep', 'robot', 'dock']);
    expect(part(layer, 'vacuum').children[1]?.rotation.y).toBeCloseTo(Math.PI / 2);
    layer.dispose();
    expect(part(layer, 'vacuum').children).toHaveLength(0);
  });
});
