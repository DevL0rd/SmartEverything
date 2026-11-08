import { Mesh, MeshBasicMaterial, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import type { RenderOpening, RenderWall } from '../render-scene';
import {
  buildOpeningPulse,
  buildOpenings,
  changedOpenings,
  DOOR_OPEN_DEG,
  HANDLE_HEIGHT_M,
  OPENING_POSITIVE,
  PULSE_RING_M,
  WINDOW_OPEN_DEG,
  WINDOW_TILT_DEG,
  openingStatesOf,
  type OpeningLiveDraw,
  type OpeningsContext,
} from './openings-live';
import { OVERLAY_LOOKS, OVERLAY_OPACITY } from './overlay-kit';

const RAD = Math.PI / 180;

const WALL: RenderWall = {
  id: 'w1',
  from: { x: 4, y: 0 },
  to: { x: 4, y: 4 },
  thickness: 0.1,
  height: 2.5,
  kind: 'solid',
  exterior: false,
};

const opening = (extra: Partial<RenderOpening> = {}): RenderOpening => ({
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
  roomIds: [],
  ...extra,
});

const context = (openings: readonly RenderOpening[]): OpeningsContext => ({
  floor: { openings, walls: [WALL] },
  y: 0,
  tones: { look: OVERLAY_LOOKS.light, positive: OPENING_POSITIVE.light },
});

const draw = (extra: Partial<OpeningLiveDraw> = {}): OpeningLiveDraw => ({
  id: 'door',
  contact: 'open',
  locked: null,
  ...extra,
});

const byName = (objects: readonly Object3D[], name: string): Object3D => {
  for (const object of objects) {
    const found = object.name === name ? object : object.getObjectByName(name);
    if (found !== undefined) return found;
  }
  throw new Error(`missing ${name}`);
};

const colourOf = (object: Object3D): string => {
  if (object instanceof Mesh && object.material instanceof MeshBasicMaterial)
    return `#${object.material.color.getHexString()}`;
  throw new Error('not a basic mesh');
};

const has = (objects: readonly Object3D[], name: string): boolean =>
  objects.some((object) => object.name === name || object.getObjectByName(name) !== undefined);

describe('3d live openings', () => {
  it('turns an open door leaf 70 degrees into the room with the warning edge and dot', () => {
    const built = buildOpenings([draw()], context([opening()]));
    expect(byName(built, 'opening:door:0').rotation.y).toBeCloseTo((90 - DOOR_OPEN_DEG) * RAD);
    expect(colourOf(byName(built, 'opening:door:0:edge'))).toBe(OVERLAY_LOOKS.light.warning);
    expect(colourOf(byName(built, 'opening:door:0:sensor'))).toBe(OVERLAY_LOOKS.light.warning);
    const outward = buildOpenings([draw()], context([opening({ swing: 'out', hinge: 'right' })]));
    expect(byName(outward, 'opening:door:0').rotation.y).toBeCloseTo((-90 - DOOR_OPEN_DEG) * RAD);
  });

  it('draws a closed leaf on the wall line with a positive dot and no warning edge', () => {
    const built = buildOpenings([draw({ contact: 'closed' })], context([opening()]));
    expect(byName(built, 'opening:door:0').rotation.y).toBeCloseTo(Math.PI / 2);
    expect(has(built, 'opening:door:0:edge')).toBe(false);
    expect(colourOf(byName(built, 'opening:door:0:sensor'))).toBe(OPENING_POSITIVE.light);
  });

  it('greys an offline sensor and draws its closed shape', () => {
    const built = buildOpenings([draw({ contact: 'unknown' })], context([opening()]));
    expect(byName(built, 'opening:door:0').rotation.y).toBeCloseTo(Math.PI / 2);
    expect(colourOf(byName(built, 'opening:door:0:leaf'))).toBe(OVERLAY_LOOKS.light.muted);
    expect(colourOf(byName(built, 'opening:door:0:sensor'))).toBe(OVERLAY_LOOKS.light.muted);
  });

  it('turns a window sash out 35 degrees and tilts it into the room only for a tilt reading', () => {
    const window = opening({ id: 'pane', kind: 'window', sillHeight: 0.9, headHeight: 2 });
    const open = buildOpenings([draw({ id: 'pane' })], context([window]));
    const sash = byName(open, 'opening:pane:0');
    expect(sash.rotation.y).toBeCloseTo((90 - WINDOW_OPEN_DEG) * RAD);
    expect(sash.position.y).toBeCloseTo(0.9);
    expect(sash.children[0]?.rotation.x).toBe(0);
    const tilted = buildOpenings([draw({ id: 'pane', contact: 'tilted' })], context([window]));
    const tilt = byName(tilted, 'opening:pane:0');
    expect(tilt.rotation.y).toBeCloseTo(Math.PI / 2);
    expect(tilt.children[0]?.rotation.x).toBeCloseTo(WINDOW_TILT_DEG * RAD);
    expect(colourOf(byName(tilted, 'opening:pane:0:edge'))).toBe(OVERLAY_LOOKS.light.warning);
    expect(buildOpenings([draw({ id: 'pane', contact: null })], context([window]))).toHaveLength(0);
  });

  it('opens both leaves of a double door and slides a sliding door along its wall', () => {
    const double = buildOpenings([draw()], context([opening({ kind: 'double_door' })]));
    expect(byName(double, 'opening:door:0').rotation.y).toBeCloseTo((90 - DOOR_OPEN_DEG) * RAD);
    expect(byName(double, 'opening:door:1').rotation.y).toBeCloseTo((-90 + DOOR_OPEN_DEG) * RAD);
    const sliding = buildOpenings([draw()], context([opening({ kind: 'sliding_door' })]));
    const panel = byName(sliding, 'opening:door:0');
    expect(panel.rotation.y).toBeCloseTo(-Math.PI / 2);
    expect(panel.position.z).toBeCloseTo(-1.5);
    expect(panel.position.x).toBeGreaterThan(4);
  });

  it('floats the lock badge beside the door at handle height on the far side of the swing', () => {
    const locked = buildOpenings([draw({ locked: true })], context([opening()]));
    const badge = byName(locked, 'lock:door');
    expect(badge.position.y).toBeCloseTo(HANDLE_HEIGHT_M);
    expect(badge.position.x).toBeLessThan(4 - WALL.thickness / 2);
    expect(badge.position.z).toBeCloseTo(-2);
    expect(colourOf(byName(locked, 'lock-body:door'))).toBe(OPENING_POSITIVE.light);
    const open = buildOpenings([draw({ locked: false })], context([opening()]));
    expect(colourOf(byName(open, 'lock-body:door'))).toBe(OVERLAY_LOOKS.light.warning);
    expect(byName(open, 'lock-shackle:door').position.y).toBeGreaterThan(
      byName(locked, 'lock-shackle:door').position.y,
    );
  });

  it('draws no leaf for a plain opening and nothing for a missing or empty opening', () => {
    expect(
      buildOpenings([draw()], context([opening({ kind: 'opening', lockDeviceId: null })])),
    ).toHaveLength(0);
    expect(buildOpenings([draw({ id: 'gone' })], context([opening()]))).toHaveLength(0);
    expect(buildOpenings([draw()], context([opening({ to: { x: 4, y: 1 } })]))).toHaveLength(0);
  });

  it('grows the pulse ring from the leaf and fades it out in one pass', () => {
    const pulse = buildOpeningPulse(draw(), context([opening()]));
    if (pulse === null) throw new Error('no pulse');
    expect(pulse.ring.scale.x).toBeCloseTo(PULSE_RING_M.from);
    expect(pulse.ring.material.opacity).toBeCloseTo(OVERLAY_OPACITY.alert);
    pulse.at(1);
    expect(pulse.ring.scale.x).toBeCloseTo(PULSE_RING_M.to);
    expect(pulse.ring.material.opacity).toBe(0);
    expect(buildOpeningPulse(draw({ contact: null }), context([opening()]))).toBeNull();
  });

  it('names the changed openings only after a first draw and only while motion is allowed', () => {
    const closed = openingStatesOf([
      draw({ contact: 'closed' }),
      draw({ id: 'plain', contact: null }),
    ]);
    const open = openingStatesOf([draw({ contact: 'open' })]);
    expect([...closed.keys()]).toEqual(['door']);
    expect(changedOpenings(null, open, true)).toEqual([]);
    expect(changedOpenings(closed, open, true)).toEqual(['door']);
    expect(changedOpenings(closed, open, false)).toEqual([]);
    expect(changedOpenings(open, open, true)).toEqual([]);
  });
});
