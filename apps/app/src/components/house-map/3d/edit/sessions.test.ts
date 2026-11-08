import { describe, expect, it } from 'vitest';
import { NO_MODIFIERS, type Modifiers } from '../../edit/gestures';
import { EDIT_EVENT, EDIT_FLOOR, type EditFloorWire } from '../map-3d-edit-protocol';
import type { Vec3 } from '../mesh';
import type { Point } from '../render-core-gestures';
import { NO_INSETS, buildCamera, type CameraView, type OrbitState } from '../render-core-orbit';
import type { SceneFrame } from '../vacuum-geometry';
import { screenNdc } from './ground';
import type { DragSession, EditEventDraft } from './pointer';
import { WALL_SNAP_TEXT, MoveTargetMissingError, type MoveView } from './sessions';
import { HandleDragUnavailableError, moveDrags, type MovePreview } from './sessions-factory';

const SPEAKER = '0b8f1c1e-1d2a-4c3b-8a9d-1e2f3a4b5c6d';
const LIGHT = '1c9f2d2f-2e3b-4d4c-9b0e-2f3a4b5c6d7e';
const PLUG = '2d0a3e3a-3f4c-4e5d-8c1f-3a4b5c6d7e8f';

const ALT: Modifiers = { shift: false, alt: true, free: false };

const FRAME: SceneFrame = { centre: [5, 0, -3], radius: 8 };

const PHONE: CameraView = { width: 400, height: 800, insets: NO_INSETS };

const CAMERAS: Readonly<Record<'top' | 'angled', OrbitState>> = {
  top: { azimuth: 0, polar: 0, distance: 16, target: [5, 0, -3], top: true },
  angled: { azimuth: 0.3, polar: 0.9, distance: 11, target: [5, 0, -3], top: false },
};

const ORIGIN = { kind: 'hand' };

function wall(id: string, from: readonly [number, number], to: readonly [number, number]): unknown {
  const [fx, fy] = from;
  const [tx, ty] = to;
  return {
    id,
    from: { x: fx, y: fy },
    to: { x: tx, y: ty },
    thickness: 0.1,
    height: null,
    kind: 'solid',
    origin: ORIGIN,
  };
}

function object(id: string, at: readonly [number, number], extra: object): unknown {
  const [x, y] = at;
  return {
    id,
    modelId: id,
    finish: null,
    params: {},
    at: { x, y },
    rotation: 0,
    elevation: 0,
    label: null,
    locked: false,
    origin: ORIGIN,
    ...extra,
  };
}

function placement(deviceId: string, at: readonly [number, number], extra: object): unknown {
  const [x, y] = at;
  return {
    deviceId,
    floorId: 'f1',
    at: { x, y },
    rotation: 0,
    height: 0,
    tilt: 0,
    mount: 'floor',
    auto: false,
    camera: null,
    ...extra,
  };
}

const ROOM = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 6 },
  { x: 0, y: 6 },
];

const EDIT: EditFloorWire = EDIT_FLOOR.parse({
  floor: {
    id: 'f1',
    name: 'Ground',
    level: 0,
    elevation: 0,
    ceilingHeight: 2.6,
    rooms: [
      {
        id: 'living',
        name: 'Living',
        homeRoomId: null,
        polygon: { outer: ROOM, holes: [] },
        labelAt: { x: 5, y: 3 },
        colourSlot: 1,
        floorMaterial: { kind: 'wood', variant: null, tint: null },
        wallPaint: null,
        ceilingHeight: null,
        origin: ORIGIN,
      },
    ],
    walls: [
      wall('south', [0, 0], [10, 0]),
      wall('east', [10, 0], [10, 6]),
      wall('north', [0, 6], [10, 6]),
      wall('west', [0, 6], [0, 0]),
    ],
    openings: [],
    objects: [
      object('chair', [5, 3], {}),
      object('sofa', [8.5, 4.5], {}),
      object('desk', [1.5, 1], {}),
      object('lamp', [1.5, 1], { elevation: 0.72 }),
      object('tv', [2, 5.9], {
        elevation: 1.2,
        rotation: 270,
        wall: { wallId: 'north', offset: 2, side: 'right' },
      }),
    ],
    placements: [
      placement(SPEAKER, [3, 1], { height: 0.75, mount: 'table' }),
      placement(LIGHT, [3, 2], { height: 2.5, mount: 'ceiling' }),
      placement(PLUG, [4, 1], {}),
    ],
    annotations: [],
  },
  boxes: {
    chair: { w: 0.5, d: 0.5, h: 0.9 },
    sofa: { w: 1, d: 1, h: 0.8 },
    desk: { w: 1.2, d: 0.6, h: 0.72 },
    lamp: { w: 0.2, d: 0.2, h: 0.4 },
    tv: { w: 1, d: 0.1, h: 0.6 },
  },
});

function viewOf(camera: 'top' | 'angled', snapping = true): MoveView {
  return {
    camera: buildCamera(CAMERAS[camera], PHONE, FRAME),
    bounds: { left: 0, top: 0, width: PHONE.width, height: PHONE.height },
    viewport: PHONE,
    edit: EDIT,
    snapping,
    nameOf: (id) => (id === 'desk' ? 'Desk' : id),
  };
}

function screenOf(view: MoveView, world: Vec3): Point {
  const ndc = screenNdc(view.camera, world);
  if (ndc === null) throw new Error(`The point ${world.join(', ')} is behind the camera`);
  return { x: ((ndc.x + 1) / 2) * PHONE.width, y: ((1 - ndc.y) / 2) * PHONE.height };
}

interface Run {
  readonly session: DragSession;
  readonly previews: (MovePreview | null)[];
  readonly emitted: EditEventDraft[];
  readonly to: (world: Vec3, modifiers?: Modifiers) => void;
}

function grab(view: MoveView, id: string, from: Vec3): Run {
  const previews: (MovePreview | null)[] = [];
  const emitted: EditEventDraft[] = [];
  const start = moveDrags({ view: () => view, preview: (preview) => previews.push(preview) });
  const session = start({
    grab: { kind: 'body', id },
    from: screenOf(view, from),
    emit: (event) => emitted.push(event),
  });
  return {
    session,
    previews,
    emitted,
    to: (world, modifiers = NO_MODIFIERS): void => {
      session.move(screenOf(view, world), modifiers);
    },
  };
}

function moved(run: Run): Extract<EditEventDraft, { readonly type: 'move' }> {
  const event = run.session.end();
  if (event?.type !== 'move') throw new Error(`Expected a move event, got ${String(event?.type)}`);
  expect(EDIT_EVENT.parse({ ...event, seq: 0 })).toEqual({ ...event, seq: 0 });
  return event;
}

function snaps(run: Run): readonly boolean[] {
  return run.emitted.flatMap((event) => (event.type === 'snap' ? [event.engaged] : []));
}

describe('moving an item on the ground', () => {
  it.each(['top', 'angled'] as const)(
    'follows the pointer ray to the ground point under it in %s view',
    (camera) => {
      const run = grab(viewOf(camera), 'chair', [5, 0, -3]);
      run.to([5.73, 0, -3.33], ALT);
      const event = moved(run);
      expect(event.at.x).toBeCloseTo(5.73, 6);
      expect(event.at.y).toBeCloseTo(3.33, 6);
      expect(event).toMatchObject({ id: 'chair', elevation: 0, height: null, mount: null });
      expect(event.wall).toBeNull();
    },
  );

  it.each(['top', 'angled'] as const)('snaps to the 0.1 m grid in %s view', (camera) => {
    const run = grab(viewOf(camera), 'chair', [5, 0, -3]);
    run.to([5.73, 0, -3.33]);
    const event = moved(run);
    expect(event.at.x).toBeCloseTo(5.7, 6);
    expect(event.at.y).toBeCloseTo(3.3, 6);
  });

  it('keeps the offset between the press and the item centre', () => {
    const run = grab(viewOf('top'), 'chair', [5.1, 0, -3.2]);
    run.to([6.1, 0, -4.2], ALT);
    const event = moved(run);
    expect(event.at.x).toBeCloseTo(6, 6);
    expect(event.at.y).toBeCloseTo(4, 6);
  });

  it('hugs a wall within the snap radius, turns away from it and ticks once', () => {
    const run = grab(viewOf('top'), 'chair', [5, 0, -3]);
    run.to([5, 0, -0.33]);
    const event = moved(run);
    expect(event.at.x).toBeCloseTo(5, 6);
    expect(event.at.y).toBeCloseTo(0.3, 6);
    expect(event.rotation).toBeCloseTo(90, 6);
    expect(run.previews.at(-1)?.labels.map((label) => label.text)).toContain(WALL_SNAP_TEXT);
    expect(snaps(run)).toEqual([true]);
  });

  it('turns snapping off for the drag while Alt is held', () => {
    const run = grab(viewOf('top'), 'chair', [5, 0, -3]);
    run.to([5, 0, -0.33], ALT);
    const event = moved(run);
    expect(event.at.y).toBeCloseTo(0.33, 6);
    expect(event.rotation).toBe(0);
    expect(snaps(run)).toEqual([]);
  });

  it('turns snapping off while the magnet is off', () => {
    const run = grab(viewOf('top', false), 'chair', [5, 0, -3]);
    run.to([5.73, 0, -3.33]);
    expect(moved(run).at.x).toBeCloseTo(5.73, 6);
  });

  it('lands a floor device on the ground under the pointer in Top view, never on the ceiling plane', () => {
    const run = grab(viewOf('top'), PLUG, [4, 0, -1]);
    run.to([6.43, 0, -2.17], ALT);
    const event = moved(run);
    expect(event.at.x).toBeCloseTo(6.43, 6);
    expect(event.at.y).toBeCloseTo(2.17, 6);
    expect(event).toMatchObject({ height: 0, elevation: null, mount: 'floor' });
  });
});

describe('moving an item on a table', () => {
  it('lifts a table device onto the table top under the pointer', () => {
    const run = grab(viewOf('angled'), SPEAKER, [3, 0.75, -1]);
    run.to([1.43, 0.72, -1.33], ALT);
    const event = moved(run);
    expect(event.at.x).toBeCloseTo(1.43, 6);
    expect(event.at.y).toBeCloseTo(1.33, 6);
    expect(event.height).toBeCloseTo(0.72, 6);
    expect(event.mount).toBe('table');
  });

  it('aligns to the table centre with a guide named after it', () => {
    const run = grab(viewOf('angled'), SPEAKER, [3, 0.75, -1]);
    run.to([1.47, 0.72, -1.33]);
    const event = moved(run);
    expect(event.at.x).toBeCloseTo(1.5, 6);
    expect(event.at.y).toBeCloseTo(1.3, 6);
    const preview = run.previews.at(-1);
    expect(preview?.labels.map((label) => label.text)).toContain('snaps to the desk');
    expect(preview?.guides.length).toBeGreaterThan(0);
    const heights = preview?.guides.flatMap((guide) => guide.points.map((point) => point.height));
    expect(heights?.every((height) => Math.abs(height - 0.72) < 1e-6)).toBe(true);
    expect(snaps(run)).toEqual([true]);
  });

  it('moves an object standing on a table across the table top', () => {
    const run = grab(viewOf('top'), 'lamp', [1.5, 0.72, -1]);
    run.to([1.6, 0.72, -1.4], ALT);
    const event = moved(run);
    expect(event.at.x).toBeCloseTo(1.6, 6);
    expect(event.at.y).toBeCloseTo(1.4, 6);
    expect(event.elevation).toBeCloseTo(0.72, 6);
  });
});

describe('moving an item on a wall', () => {
  it('slides along and up the wall face in angled view', () => {
    const run = grab(viewOf('angled'), 'tv', [2, 1.5, -6]);
    run.to([3.03, 1.83, -6], ALT);
    const event = moved(run);
    expect(event.wall?.wallId).toBe('north');
    expect(event.wall?.offset).toBeCloseTo(3.03, 6);
    expect(event.wall?.side).toBe('right');
    expect(event.elevation).toBeCloseTo(1.53, 6);
    expect(event.at.x).toBeCloseTo(3.03, 6);
    expect(event.at.y).toBeCloseTo(5.9, 6);
    expect(event.rotation).toBeCloseTo(270, 6);
  });

  it('snaps the offset to 0.1 m and the height to 0.05 m', () => {
    const run = grab(viewOf('angled'), 'tv', [2, 1.5, -6]);
    run.to([3.03, 1.83, -6]);
    const event = moved(run);
    expect(event.wall?.offset).toBeCloseTo(3, 6);
    expect(event.elevation).toBeCloseTo(1.55, 6);
  });

  it('stays on its wall in Top view when another wall is nearer but out of reach', () => {
    const run = grab(viewOf('top'), 'tv', [2, 1.2, -5.9]);
    run.to([7, 1.2, -4.6]);
    run.to([9, 1.2, -2.5]);
    const event = moved(run);
    expect(event.wall?.wallId).toBe('north');
    expect(event.wall?.offset).toBeCloseTo(9, 6);
    expect(event.elevation).toBeCloseTo(1.2, 6);
    expect(snaps(run)).toEqual([]);
  });

  it('hops onto another wall within the hit radius and ticks', () => {
    const run = grab(viewOf('top'), 'tv', [2, 1.2, -5.9]);
    run.to([9.93, 1.2, -3]);
    const event = moved(run);
    expect(event.wall).toEqual({ wallId: 'east', offset: 3, side: 'left' });
    expect(event.at.x).toBeCloseTo(9.9, 6);
    expect(event.at.y).toBeCloseTo(3, 6);
    expect(event.rotation).toBeCloseTo(180, 6);
    expect(event.elevation).toBeCloseTo(1.2, 6);
    expect(snaps(run)).toEqual([true]);
  });
});

describe('moving a ceiling device', () => {
  it.each(['top', 'angled'] as const)(
    'stays at its height under the pointer in %s view',
    (camera) => {
      const run = grab(viewOf(camera), LIGHT, [3, 2.5, -2]);
      run.to([6, 2.5, -4], ALT);
      const event = moved(run);
      expect(event.at.x).toBeCloseTo(6, 6);
      expect(event.at.y).toBeCloseTo(4, 6);
      expect(event).toMatchObject({ height: 2.5, mount: 'ceiling' });
    },
  );
});

describe('a move session', () => {
  it('drops its preview when cancelled', () => {
    const run = grab(viewOf('top'), 'chair', [5, 0, -3]);
    run.to([6, 0, -4]);
    run.session.cancel();
    expect(run.previews.at(-2)?.pose.at.x).toBeCloseTo(6, 6);
    expect(run.previews.at(-1)).toBeNull();
  });

  it('ends with nothing when it never moved', () => {
    const run = grab(viewOf('top'), 'chair', [5, 0, -3]);
    expect(run.session.end()).toBeNull();
  });

  it('turns a held object with a second finger and ends in a resize of its box', () => {
    const run = grab(viewOf('top'), 'chair', [5, 0, -3]);
    run.session.twist({ scale: 2, twistDeg: 30 }, { ...NO_MODIFIERS, free: true }, [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
    const event = run.session.end();
    expect(event?.type).toBe('resize');
    if (event?.type !== 'resize') return;
    expect(event.box.rotation).toBeCloseTo(30, 6);
    expect(event.box).toMatchObject({ w: 0.5, d: 0.5, h: null });
    expect(event.box.at).toEqual({ x: 5, y: 3 });
  });

  it('refuses a handle grab and an id that is not on the floor', () => {
    const view = viewOf('top');
    const start = moveDrags({ view: () => view, preview: () => undefined });
    const emit = (): void => undefined;
    expect(() =>
      start({ grab: { kind: 'handle', handleId: 'corner-ne' }, from: { x: 0, y: 0 }, emit }),
    ).toThrow(HandleDragUnavailableError);
    expect(() =>
      start({ grab: { kind: 'body', id: 'ghost' }, from: { x: 0, y: 0 }, emit }),
    ).toThrow(MoveTargetMissingError);
  });
});
