import { describe, expect, it } from 'vitest';
import { HOME_MAP_CAMERA_FOV_DEFAULT } from '@smarteverything/domain';
import { NO_MODIFIERS, type Modifiers } from '../../edit/gestures';
import {
  EDIT_EVENT,
  EDIT_FLOOR,
  NO_EDIT_OVERLAY,
  type EditFloorWire,
  type EditHandleTarget,
  type EditOverlay,
} from '../map-3d-edit-protocol';
import type { Vec3 } from '../mesh';
import type { Point } from '../render-core-gestures';
import { NO_INSETS, buildCamera, type CameraView, type OrbitState } from '../render-core-orbit';
import type { SceneFrame } from '../vacuum-geometry';
import { screenNdc } from './ground';
import type { DragSession, EditEventDraft } from './pointer';
import { HandleDragUnavailableError } from './sessions-factory';
import { BodyDragUnavailableError, shapeDrags } from './sessions-shape';
import {
  ShapeTargetMissingError,
  type EditHandle,
  type ScanPlacement,
  type ShapePreview,
  type ShapeView,
} from './sessions-shape-base';

const CAMERA = '3e1b4f4b-4a5d-4f6e-9d20-4b5c6d7e8f90';

const ALT: Modifiers = { shift: false, alt: true, free: false };

const FRAME: SceneFrame = { centre: [5, 0, -3], radius: 8 };

const PHONE: CameraView = { width: 400, height: 800, insets: NO_INSETS };

type Look = 'top' | 'angled';

const LOOKS: readonly Look[] = ['top', 'angled'];

const CAMERAS: Readonly<Record<Look, OrbitState>> = {
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

function room(id: string, outer: readonly (readonly [number, number])[]): unknown {
  return {
    id,
    name: id,
    homeRoomId: null,
    polygon: { outer: outer.map(([x, y]) => ({ x, y })), holes: [] },
    labelAt: { x: 0, y: 0 },
    colourSlot: 1,
    floorMaterial: { kind: 'wood', variant: null, tint: null },
    wallPaint: null,
    ceilingHeight: null,
    origin: ORIGIN,
  };
}

const EDIT: EditFloorWire = EDIT_FLOOR.parse({
  floor: {
    id: 'f1',
    name: 'Ground',
    level: 0,
    elevation: 0,
    ceilingHeight: 2.6,
    rooms: [
      room('living', [
        [0, 0],
        [10, 0],
        [10, 6],
        [0, 6],
      ]),
      room('hall', [
        [11, 7],
        [13, 7],
        [13, 9],
        [11, 9],
      ]),
    ],
    walls: [
      wall('south', [0, 0], [10, 0]),
      wall('east', [10, 0], [10, 6]),
      wall('north', [0, 6], [10, 6]),
      wall('west', [0, 6], [0, 0]),
    ],
    openings: [
      {
        id: 'door',
        wallId: 'south',
        offset: 2,
        width: 1,
        kind: 'door',
        sillHeight: 0,
        headHeight: 2,
        hinge: 'left',
        swing: 'in',
        contactDeviceId: null,
        lockDeviceId: null,
        origin: ORIGIN,
      },
    ],
    objects: [],
    placements: [
      {
        deviceId: CAMERA,
        floorId: 'f1',
        at: { x: 2, y: 4 },
        rotation: 0,
        height: 2,
        tilt: 30,
        mount: 'wall',
        auto: false,
        camera: {
          ...HOME_MAP_CAMERA_FOV_DEFAULT,
          fovSource: 'exact',
          pan: { mode: 'fixed', yawDeg: 0, presets: {} },
          showCone: true,
        },
      },
    ],
    annotations: [],
  },
  boxes: {},
});

const GROUND = { kind: 'ground' } as const;

function handle(
  id: string,
  kind: EditHandle['kind'],
  at: readonly [number, number, number],
  target: EditHandleTarget,
): EditHandle {
  const [x, y, height] = at;
  return { id, kind, at: { x, y, height }, surface: GROUND, target };
}

const HANDLES: readonly EditHandle[] = [
  handle('corner', 'point', [10, 6, 0], { kind: 'room-corner', roomId: 'living', index: 2 }),
  handle('side', 'edge', [5, 0, 0], { kind: 'room-side', roomId: 'living', index: 0 }),
  handle('end', 'point', [10, 6, 0], { kind: 'wall-end', wallId: 'east', end: 'to' }),
  handle('middle', 'edge', [10, 3, 0], { kind: 'wall-middle', wallId: 'east' }),
  handle('rect', 'corner', [14, 3, 0], { kind: 'rect-corner', anchor: { x: 12, y: 1 } }),
  handle('door', 'side', [2.5, 0, 0], { kind: 'opening', openingId: 'door', part: 'body' }),
  handle('door-to', 'side', [3, 0, 0], { kind: 'opening', openingId: 'door', part: 'to' }),
  handle('door-from', 'side', [2, 0, 0], { kind: 'opening', openingId: 'door', part: 'from' }),
  {
    id: 'door-wall',
    kind: 'side',
    at: { x: 2.5, y: 0, height: 1.3 },
    surface: { kind: 'along-wall', wallId: 'south' },
    target: { kind: 'opening', openingId: 'door', part: 'body' },
  },
  handle('scan-move', 'plane', [5, 3, 0], { kind: 'scan' }),
  handle('scan-ring', 'ring', [5, 5, 0], { kind: 'scan' }),
  handle('scan-scale', 'uniform', [7, 5, 0], { kind: 'scan' }),
  handle('scan-lift', 'top', [5, 3, 1], { kind: 'scan' }),
  handle('scan-axis', 'axis-x', [6, 3, 0], { kind: 'scan' }),
  handle('yaw', 'cone-yaw', [5, 4, 0], { kind: 'cone', deviceId: CAMERA }),
  handle('pitch', 'cone-pitch', [5.46, 4, 0], { kind: 'cone', deviceId: CAMERA }),
  handle('cone-ring', 'ring', [5, 4, 0], { kind: 'cone', deviceId: CAMERA }),
  handle('ghost-room', 'point', [0, 0, 0], { kind: 'room-corner', roomId: 'gone', index: 0 }),
  handle('zone-corner', 'point', [4, 4, 0], { kind: 'shape-corner', shapeId: 'zone', index: 2 }),
  handle('barrier-to', 'point', [8, 1, 0], { kind: 'line-end', lineId: 'barrier', end: 'to' }),
  handle('ghost-zone', 'point', [0, 0, 0], { kind: 'shape-corner', shapeId: 'gone', index: 0 }),
  handle('zone-as-line', 'point', [2, 2, 0], { kind: 'line-end', lineId: 'zone', end: 'from' }),
];

const SCAN: ScanPlacement = { tx: 1, ty: 2, tz: 0, yawDeg: 0, scale: 1 };

const OVERLAY: EditOverlay = {
  ...NO_EDIT_OVERLAY,
  mode: 'select',
  gizmo: {
    mode: 'move',
    space: 'world',
    centre: { x: 5, y: 3, height: 0 },
    axes: ['x', 'y', 'z'],
    turn: 0,
  },
  handles: [...HANDLES],
  shapes: [
    {
      kind: 'ring',
      id: 'zone',
      points: [
        { x: 2, y: 2 },
        { x: 4, y: 2 },
        { x: 4, y: 4 },
        { x: 2, y: 4 },
      ],
    },
    { kind: 'line', id: 'barrier', from: { x: 6, y: 1 }, to: { x: 8, y: 1 } },
  ],
};

function viewOf(look: Look, extra: Partial<ShapeView> = {}): ShapeView {
  return {
    camera: buildCamera(CAMERAS[look], PHONE, FRAME),
    bounds: { left: 0, top: 0, width: PHONE.width, height: PHONE.height },
    viewport: PHONE,
    edit: EDIT,
    snapping: true,
    nameOf: (id) => id,
    overlay: OVERLAY,
    scan: SCAN,
    ...extra,
  };
}

function screenOf(view: ShapeView, world: Vec3): Point {
  const ndc = screenNdc(view.camera, world);
  if (ndc === null) throw new Error(`The point ${world.join(', ')} is behind the camera`);
  return { x: ((ndc.x + 1) / 2) * PHONE.width, y: ((1 - ndc.y) / 2) * PHONE.height };
}

function ground(x: number, y: number, height = 0): Vec3 {
  return [x, height, -y];
}

interface Run {
  readonly session: DragSession;
  readonly previews: (ShapePreview | null)[];
  readonly emitted: EditEventDraft[];
  readonly to: (world: Vec3, modifiers?: Modifiers) => void;
}

function drag(view: ShapeView, handleId: string, from: Vec3): Run {
  const previews: (ShapePreview | null)[] = [];
  const emitted: EditEventDraft[] = [];
  const start = shapeDrags({ view: () => view, preview: (preview) => previews.push(preview) });
  const session = start({
    grab: { kind: 'handle', handleId },
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

type Draft<T extends EditEventDraft['type']> = Extract<EditEventDraft, { readonly type: T }>;

function isType<T extends EditEventDraft['type']>(
  event: EditEventDraft | null,
  type: T,
): event is Draft<T> {
  return event?.type === type;
}

function ended<T extends EditEventDraft['type']>(run: Run, type: T): Draft<T> {
  const event = run.session.end();
  if (!isType(event, type)) throw new Error(`Expected a ${type} event, got ${String(event?.type)}`);
  expect(EDIT_EVENT.parse({ ...event, seq: 0 })).toEqual({ ...event, seq: 0 });
  return event;
}

function snaps(run: Run): readonly boolean[] {
  return run.emitted.flatMap((event) => (event.type === 'snap' ? [event.engaged] : []));
}

function polygonOf(preview: ShapePreview | null | undefined): readonly { x: number; y: number }[] {
  const shape = preview?.ghosts[0];
  if (shape === undefined) throw new Error('Expected a ghost in the preview');
  return shape.points;
}

describe('dragging a room corner', () => {
  it.each(LOOKS)('follows the pointer ray on the ground with Alt in %s view', (look) => {
    const run = drag(viewOf(look), 'corner', ground(10, 6));
    run.to(ground(8.73, 4.58), ALT);
    const event = ended(run, 'vertex');
    expect(event.handleId).toBe('corner');
    expect(event.point.x).toBeCloseTo(8.73, 6);
    expect(event.point.y).toBeCloseTo(4.58, 6);
    expect(polygonOf(run.previews.at(-1))[2]?.x).toBeCloseTo(8.73, 6);
  });

  it.each(LOOKS)('snaps to the 0.1 m grid in %s view', (look) => {
    const run = drag(viewOf(look), 'corner', ground(10, 6));
    run.to(ground(8.73, 4.58));
    const event = ended(run, 'vertex');
    expect(event.point.x).toBeCloseTo(8.7, 6);
    expect(event.point.y).toBeCloseTo(4.6, 6);
    expect(snaps(run)).toEqual([]);
  });

  it('keeps the offset between the press and the corner', () => {
    const run = drag(viewOf('top'), 'corner', ground(9.9, 5.9));
    run.to(ground(8.9, 4.9), ALT);
    const event = ended(run, 'vertex');
    expect(event.point.x).toBeCloseTo(9, 6);
    expect(event.point.y).toBeCloseTo(5, 6);
  });

  it('snaps onto another room corner and ticks on and off', () => {
    const run = drag(viewOf('top'), 'corner', ground(10, 6));
    run.to(ground(11.06, 7.04));
    expect(ended(run, 'vertex').point).toEqual({ x: 11, y: 7 });
    run.to(ground(8.73, 4.58));
    expect(snaps(run)).toEqual([true, false]);
  });

  it('turns snapping off when the magnet is off', () => {
    const run = drag(viewOf('top', { snapping: false }), 'corner', ground(10, 6));
    run.to(ground(11.06, 7.04));
    const event = ended(run, 'vertex');
    expect(event.point.x).toBeCloseTo(11.06, 6);
    expect(snaps(run)).toEqual([]);
  });

  it('refuses a corner that would make the outline cross itself and keeps the last good one', () => {
    const run = drag(viewOf('top'), 'corner', ground(10, 6));
    run.to(ground(8, 5), ALT);
    const shown = run.previews.length;
    run.to(ground(-2, 3), ALT);
    expect(run.previews).toHaveLength(shown);
    const event = ended(run, 'vertex');
    expect(event.point.x).toBeCloseTo(8, 6);
    expect(event.point.y).toBeCloseTo(5, 6);
  });

  it('sends nothing when the corner ends where it started', () => {
    const run = drag(viewOf('top'), 'corner', ground(10, 6));
    run.to(ground(10.02, 6.01));
    expect(run.session.end()).toBeNull();
  });

  it('clears the preview on cancel and sends nothing', () => {
    const run = drag(viewOf('angled'), 'corner', ground(10, 6));
    run.to(ground(8.73, 4.58));
    run.session.cancel();
    expect(run.previews.at(-1)).toBeNull();
    expect(run.session.end()).toBeNull();
  });

  it('labels the two sides that meet at the corner', () => {
    const run = drag(viewOf('top'), 'corner', ground(10, 6));
    run.to(ground(10, 4), ALT);
    expect(run.previews.at(-1)?.labels.map((each) => each.text)).toEqual(['4.00 m', '10.20 m']);
  });
});

describe('dragging a wall end', () => {
  it.each(LOOKS)('follows the ray with Alt in %s view', (look) => {
    const run = drag(viewOf(look), 'end', ground(10, 6));
    run.to(ground(12.33, 8.2), ALT);
    const event = ended(run, 'vertex');
    expect(event.point.x).toBeCloseTo(12.33, 6);
    expect(event.point.y).toBeCloseTo(8.2, 6);
  });

  it.each(LOOKS)('keeps the wall on a 45 degree step from its other end in %s view', (look) => {
    const run = drag(viewOf(look), 'end', ground(10, 6));
    run.to(ground(10.4, 8.23));
    const event = ended(run, 'vertex');
    expect(event.point.x).toBeCloseTo(10, 6);
    expect(event.point.y).toBeGreaterThan(8);
  });

  it('ignores a pointer on the other end, which would make the wall zero long', () => {
    const run = drag(viewOf('top'), 'end', ground(10, 6));
    run.to(ground(10, 0), ALT);
    expect(run.previews).toEqual([]);
    expect(run.session.end()).toBeNull();
  });
});

describe('pushing a room side or a wall', () => {
  it.each(LOOKS)('moves the side along its normal only, with Alt, in %s view', (look) => {
    const run = drag(viewOf(look), 'side', ground(5, 0));
    run.to(ground(5.3, 0.73), ALT);
    const event = ended(run, 'edge');
    expect(event.handleId).toBe('side');
    expect(event.offset).toBeCloseTo(0.73, 6);
    const ring = polygonOf(run.previews.at(-1));
    expect(ring[0]?.y).toBeCloseTo(0.73, 6);
    expect(ring[1]?.y).toBeCloseTo(0.73, 6);
    expect(ring[0]?.x).toBeCloseTo(0, 6);
  });

  it.each(LOOKS)('steps the push to the grid in %s view', (look) => {
    const run = drag(viewOf(look), 'side', ground(5, 0));
    run.to(ground(5.3, 0.73));
    expect(ended(run, 'edge').offset).toBeCloseTo(0.7, 6);
  });

  it('refuses a push that folds the room flat', () => {
    const run = drag(viewOf('top'), 'side', ground(5, 0));
    run.to(ground(5, 6), ALT);
    expect(run.previews).toEqual([]);
    expect(run.session.end()).toBeNull();
  });

  it('pushes a wall from its middle handle with a signed offset', () => {
    const run = drag(viewOf('top'), 'middle', ground(10, 3));
    run.to(ground(11.27, 3.4));
    const event = ended(run, 'edge');
    expect(event.offset).toBeCloseTo(-1.3, 6);
    const [from, to] = polygonOf(run.previews.at(-1));
    expect(from?.x).toBeCloseTo(11.3, 6);
    expect(to?.x).toBeCloseTo(11.3, 6);
    expect([from?.y, to?.y]).toEqual([0, 6]);
  });

  it('sends nothing for a push that rounds back to zero', () => {
    const run = drag(viewOf('top'), 'side', ground(5, 0));
    run.to(ground(5, 0.03));
    expect(run.session.end()).toBeNull();
  });
});

describe('drawing a rectangle by its corner', () => {
  it.each(LOOKS)('sends both opposite corners with Alt in %s view', (look) => {
    const run = drag(viewOf(look), 'rect', ground(14, 3));
    run.to(ground(15.43, 4.27), ALT);
    const event = ended(run, 'rect');
    expect(event.from).toEqual({ x: 12, y: 1 });
    expect(event.to.x).toBeCloseTo(15.43, 6);
    expect(event.to.y).toBeCloseTo(4.27, 6);
    expect(polygonOf(run.previews.at(-1))).toHaveLength(4);
  });

  it.each(LOOKS)('snaps the dragged corner to the grid in %s view', (look) => {
    const run = drag(viewOf(look), 'rect', ground(14, 3));
    run.to(ground(15.43, 4.27));
    const event = ended(run, 'rect');
    expect(event.to.x).toBeCloseTo(15.4, 6);
    expect(event.to.y).toBeCloseTo(4.3, 6);
  });

  it('labels the width and depth', () => {
    const run = drag(viewOf('top'), 'rect', ground(14, 3));
    run.to(ground(15, 4), ALT);
    expect(run.previews.at(-1)?.labels.map((each) => each.text)).toEqual(['3.00 m × 3.00 m']);
  });

  it('ignores a flat rectangle', () => {
    const run = drag(viewOf('top'), 'rect', ground(14, 3));
    run.to(ground(15, 1), ALT);
    expect(run.session.end()).toBeNull();
  });
});

describe('sliding an opening along its wall', () => {
  it.each(LOOKS)('moves the opening and keeps its width with Alt in %s view', (look) => {
    const run = drag(viewOf(look), 'door', ground(2.5, 0));
    run.to(ground(3.73, 0.4), ALT);
    const event = ended(run, 'slide');
    expect(event.id).toBe('door');
    expect(event.offset).toBeCloseTo(3.23, 6);
    expect(event.width).toBe(1);
  });

  it.each(LOOKS)('steps the offset to the grid in %s view', (look) => {
    const run = drag(viewOf(look), 'door', ground(2.5, 0));
    run.to(ground(3.73, 0.4));
    expect(ended(run, 'slide').offset).toBeCloseTo(3.2, 6);
  });

  it('follows the wall surface handle in angled view', () => {
    const run = drag(viewOf('angled'), 'door-wall', [2.5, 1.3, 0]);
    run.to([3.73, 1.3, 0], ALT);
    expect(ended(run, 'slide').offset).toBeCloseTo(3.23, 6);
  });

  it('stops at the end of the wall', () => {
    const run = drag(viewOf('top'), 'door', ground(2.5, 0));
    run.to(ground(12, 0), ALT);
    expect(ended(run, 'slide')).toMatchObject({ offset: 9, width: 1 });
  });

  it('widens from the far end and keeps the near end', () => {
    const run = drag(viewOf('top'), 'door-to', ground(3, 0));
    run.to(ground(3.62, 0));
    const event = ended(run, 'slide');
    expect(event.offset).toBe(2);
    expect(event.width).toBeCloseTo(1.6, 6);
  });

  it('narrows from the near end and keeps the far end', () => {
    const run = drag(viewOf('top'), 'door-from', ground(2, 0));
    run.to(ground(2.5, 0), ALT);
    const event = ended(run, 'slide');
    expect(event.offset).toBeCloseTo(2.5, 6);
    expect(event.width).toBeCloseTo(0.5, 6);
  });

  it('ignores a near end dragged past the far end', () => {
    const run = drag(viewOf('top'), 'door-from', ground(2, 0));
    run.to(ground(3.5, 0), ALT);
    expect(run.session.end()).toBeNull();
  });

  it('clears the preview on cancel', () => {
    const run = drag(viewOf('top'), 'door', ground(2.5, 0));
    run.to(ground(3.73, 0.4));
    run.session.cancel();
    expect(run.previews.at(-1)).toBeNull();
    expect(run.session.end()).toBeNull();
  });
});

describe('dragging a zone corner or a line end', () => {
  it.each(LOOKS)('moves a zone corner with Alt and keeps the ring in %s view', (look) => {
    const run = drag(viewOf(look), 'zone-corner', ground(4, 4));
    run.to(ground(4.33, 4.71), ALT);
    const event = ended(run, 'vertex');
    expect(event.handleId).toBe('zone-corner');
    expect(event.point.x).toBeCloseTo(4.33, 6);
    expect(event.point.y).toBeCloseTo(4.71, 6);
    expect(polygonOf(run.previews.at(-1))).toHaveLength(4);
  });

  it('steps a zone corner to the grid and snaps it to the end of another shape', () => {
    const stepped = drag(viewOf('top'), 'zone-corner', ground(4, 4));
    stepped.to(ground(4.33, 4.71));
    const grid = ended(stepped, 'vertex').point;
    expect(grid.x).toBeCloseTo(4.3, 6);
    expect(grid.y).toBeCloseTo(4.7, 6);
    const snapped = drag(viewOf('top'), 'zone-corner', ground(4, 4));
    snapped.to(ground(6.03, 1.04));
    expect(ended(snapped, 'vertex').point).toEqual({ x: 6, y: 1 });
    expect(snaps(snapped)).toEqual([true]);
  });

  it('drops a frame that would make the zone cross itself', () => {
    const run = drag(viewOf('top'), 'zone-corner', ground(4, 4));
    run.to(ground(1, 3), ALT);
    expect(run.previews).toEqual([]);
    expect(run.session.end()).toBeNull();
  });

  it('moves a line end on a 45 degree step from its other end and onto a wall corner', () => {
    const level = drag(viewOf('top'), 'barrier-to', ground(8, 1));
    level.to(ground(9.33, 1.04));
    const kept = ended(level, 'vertex').point;
    expect(kept.x).toBeCloseTo(9.3, 6);
    expect(kept.y).toBeCloseTo(1, 6);
    const corner = drag(viewOf('top'), 'barrier-to', ground(8, 1));
    corner.to(ground(9.97, 0.03));
    expect(ended(corner, 'vertex').point).toEqual({ x: 10, y: 0 });
  });

  it('fails loudly for a missing shape or a shape of the other kind', () => {
    expect(() => drag(viewOf('top'), 'ghost-zone', ground(0, 0))).toThrow(ShapeTargetMissingError);
    expect(() => drag(viewOf('top'), 'zone-as-line', ground(2, 2))).toThrow(
      ShapeTargetMissingError,
    );
  });
});

describe('aligning the realistic scan', () => {
  const EXTENT = { minX: -1.05, minY: -1, maxX: 1.05, maxY: 1 };

  it('snaps a scan corner onto the nearest wall point while moving, unless Alt', () => {
    const view = viewOf('top', { overlay: { ...OVERLAY, scanExtent: EXTENT } });
    const snapped = drag(view, 'scan-move', ground(5, 3));
    snapped.to(ground(8.02, 1.98));
    const { placement } = ended(snapped, 'scan');
    expect(placement.tx).toBeCloseTo(3.95, 6);
    expect(placement.ty).toBeCloseTo(1, 6);
    expect(snaps(snapped)).toEqual([true]);
    const free = drag(view, 'scan-move', ground(5, 3));
    free.to(ground(8, 2), ALT);
    expect(ended(free, 'scan').placement.tx).toBeCloseTo(4, 6);
    expect(snaps(free)).toEqual([]);
  });

  it.each(LOOKS)('moves the scan on the ground with Alt in %s view', (look) => {
    const run = drag(viewOf(look), 'scan-move', ground(5, 3));
    run.to(ground(5.73, 3.46), ALT);
    const { placement } = ended(run, 'scan');
    expect(placement.tx).toBeCloseTo(1.73, 6);
    expect(placement.ty).toBeCloseTo(2.46, 6);
    expect(placement).toMatchObject({ tz: 0, yawDeg: 0, scale: 1 });
    expect(run.previews.at(-1)).toMatchObject({ kind: 'scan', placement });
  });

  it.each(LOOKS)('steps the move to the grid in %s view', (look) => {
    const run = drag(viewOf(look), 'scan-move', ground(5, 3));
    run.to(ground(5.73, 3.46));
    const { placement } = ended(run, 'scan');
    expect(placement.tx).toBeCloseTo(1.7, 6);
    expect(placement.ty).toBeCloseTo(2.5, 6);
  });

  it('turns the scan about the gizmo centre', () => {
    const run = drag(viewOf('top'), 'scan-ring', ground(5, 5));
    run.to(ground(3, 3));
    const { placement } = ended(run, 'scan');
    expect(placement.yawDeg).toBeCloseTo(90, 6);
    expect(placement.tx).toBeCloseTo(6, 6);
    expect(placement.ty).toBeCloseTo(-1, 6);
  });

  it.each([
    [NO_MODIFIERS, 30],
    [ALT, 23],
  ] as const)('steps the turn by 15 degrees unless Alt is held', (modifiers, yaw) => {
    const run = drag(viewOf('angled'), 'scan-ring', ground(5, 5));
    const angle = (113 * Math.PI) / 180;
    run.to(ground(5 + 2 * Math.cos(angle), 3 + 2 * Math.sin(angle)), modifiers);
    expect(ended(run, 'scan').placement.yawDeg).toBeCloseTo(yaw, 6);
  });

  it('scales the scan about the gizmo centre', () => {
    const run = drag(viewOf('top'), 'scan-scale', ground(7, 5));
    run.to(ground(9, 7));
    const { placement } = ended(run, 'scan');
    expect(placement.scale).toBeCloseTo(2, 6);
    expect(placement.tx).toBeCloseTo(-3, 6);
    expect(placement.ty).toBeCloseTo(1, 6);
    expect(run.previews.at(-1)?.labels[0]?.text).toBe('200%');
  });

  it('ignores a scale handle dragged onto the centre', () => {
    const run = drag(viewOf('top'), 'scan-scale', ground(7, 5));
    run.to(ground(5, 3));
    expect(run.session.end()).toBeNull();
  });

  it.each([
    [ALT, 0.37],
    [NO_MODIFIERS, 0.35],
  ] as const)('lifts the scan on its up arrow in angled view', (modifiers, tz) => {
    const run = drag(viewOf('angled'), 'scan-lift', [5, 1, -3]);
    run.to([5, 1.37, -3], modifiers);
    expect(ended(run, 'scan').placement.tz).toBeCloseTo(tz, 6);
  });

  it('cannot lift in Top view, where the up arrow points at the camera', () => {
    const run = drag(viewOf('top'), 'scan-lift', [5, 1, -3]);
    run.to([5.2, 1, -3.2]);
    expect(run.session.end()).toBeNull();
  });

  it('refuses a scan handle kind it does not drag', () => {
    const view = viewOf('top');
    expect(() => drag(view, 'scan-axis', ground(6, 3))).toThrow(HandleDragUnavailableError);
  });

  it('fails loudly without a scan or a gizmo centre', () => {
    expect(() => drag(viewOf('top', { scan: null }), 'scan-move', ground(5, 3))).toThrow(
      ShapeTargetMissingError,
    );
    const bare = viewOf('top', { overlay: { ...OVERLAY, gizmo: null } });
    expect(() => drag(bare, 'scan-ring', ground(5, 5))).toThrow(ShapeTargetMissingError);
  });
});

describe('turning a camera cone', () => {
  it.each([
    [NO_MODIFIERS, 30],
    [ALT, 37],
  ] as const)('turns the yaw at the cone tip, stepped unless Alt (%o)', (modifiers, yaw) => {
    for (const look of LOOKS) {
      const run = drag(viewOf(look), 'yaw', ground(5, 4));
      const angle = (37 * Math.PI) / 180;
      run.to(ground(2 + 3 * Math.cos(angle), 4 + 3 * Math.sin(angle)), modifiers);
      const event = ended(run, 'cone');
      expect(event.deviceId).toBe(CAMERA);
      expect(event.yaw).toBeCloseTo(yaw, 6);
      expect(event.pitch).toBe(30);
      expect(run.previews.at(-1)).toMatchObject({ kind: 'cone', deviceId: CAMERA });
    }
  });

  it.each([
    [ALT, (Math.atan2(2, 2.5) * 180) / Math.PI],
    [NO_MODIFIERS, 45],
  ] as const)('tilts along the centre line', (modifiers, pitch) => {
    const run = drag(viewOf('angled'), 'pitch', ground(2 + 2 / Math.tan(Math.PI / 6), 4));
    run.to(ground(4.5, 4.3), modifiers);
    const event = ended(run, 'cone');
    expect(event.pitch).toBeCloseTo(pitch, 6);
    expect(event.yaw).toBe(0);
  });

  it('ignores a yaw handle dragged onto the camera itself', () => {
    const run = drag(viewOf('top'), 'yaw', ground(5, 4));
    run.to(ground(2, 4), ALT);
    expect(run.session.end()).toBeNull();
  });

  it('refuses a cone target on a handle that is not a cone handle', () => {
    expect(() => drag(viewOf('top'), 'cone-ring', ground(5, 4))).toThrow(
      HandleDragUnavailableError,
    );
  });
});

describe('starting a shape drag', () => {
  it('refuses a body grab and an unknown handle', () => {
    const view = viewOf('top');
    const start = shapeDrags({ view: () => view, preview: () => undefined });
    const base = { from: { x: 0, y: 0 }, emit: (): void => undefined };
    expect(() => start({ ...base, grab: { kind: 'body', id: 'chair' } })).toThrow(
      BodyDragUnavailableError,
    );
    expect(() => start({ ...base, grab: { kind: 'handle', handleId: 'nope' } })).toThrow(
      HandleDragUnavailableError,
    );
  });

  it('fails loudly for a handle whose room is not on the floor', () => {
    expect(() => drag(viewOf('top'), 'ghost-room', ground(0, 0))).toThrow(ShapeTargetMissingError);
  });

  it('ignores a two finger twist', () => {
    const run = drag(viewOf('top'), 'corner', ground(10, 6));
    run.session.twist({ scale: 2, twistDeg: 30 }, NO_MODIFIERS, [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
    expect(run.previews).toEqual([]);
    expect(run.session.end()).toBeNull();
  });
});
