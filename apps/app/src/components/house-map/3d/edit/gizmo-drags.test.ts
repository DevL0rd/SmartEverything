import { describe, expect, it } from 'vitest';
import { NO_MODIFIERS, type Modifiers } from '../../edit/gestures';
import { EDIT_EVENT } from '../map-3d-edit-protocol';
import type { Vec3 } from '../mesh';
import { UP, along, planDir, worldOfPlan, type GizmoView } from './gizmo';
import { editDrags, type EditPreview } from './edit-drags';
import { gizmoDrags } from './gizmo-drags';
import { gizmoView, ground, screenOf, type GizmoCase } from './gizmo-fixture';
import { gizmoLayout, type GizmoHandle, type GizmoKind } from './gizmo-handles';
import type { GizmoPreview } from './gizmo-scale';
import type { DragGrab, DragSession, EditEventDraft } from './pointer';
import { HandleDragUnavailableError } from './sessions-factory';

const ALT: Modifiers = { shift: false, alt: true, free: false };
const SHIFT_ALT: Modifiers = { shift: true, alt: true, free: false };
const SHIFT: Modifiers = { shift: true, alt: false, free: false };

interface Run {
  readonly view: GizmoView;
  readonly handle: GizmoHandle;
  readonly session: DragSession;
  readonly previews: (GizmoPreview | null)[];
  readonly to: (world: Vec3, modifiers?: Modifiers) => EditEventDraft | null;
}

function handleOf(
  view: GizmoView,
  kind: GizmoKind,
  signs?: readonly [number, number],
): GizmoHandle {
  const handle = gizmoLayout(view)?.handles.find(
    (each) =>
      each.kind === kind &&
      (signs === undefined || (each.signs[0] === signs[0] && each.signs[1] === signs[1])),
  );
  if (handle === undefined) throw new Error(`No ${kind} handle`);
  return handle;
}

function drag(given: GizmoCase, kind: GizmoKind, signs?: readonly [number, number]): Run {
  const view = gizmoView(given);
  const handle = handleOf(view, kind, signs);
  const previews: (GizmoPreview | null)[] = [];
  const start = gizmoDrags({ view: () => view, preview: (preview) => previews.push(preview) });
  const session = start({
    grab: { kind: 'handle', handleId: handle.id },
    from: handle.screen,
    emit: () => undefined,
  });
  return {
    view,
    handle,
    session,
    previews,
    to: (world, modifiers = NO_MODIFIERS): EditEventDraft | null => {
      session.move(screenOf(view, world), modifiers);
      return session.end();
    },
  };
}

function strict(event: EditEventDraft | null): EditEventDraft {
  if (event === null) throw new Error('The drag ended without an edit');
  expect(EDIT_EVENT.safeParse({ ...event, seq: 1 }).success).toBe(true);
  return event;
}

function moveOf(event: EditEventDraft | null): Extract<EditEventDraft, { type: 'move' }> {
  const made = strict(event);
  if (made.type !== 'move') throw new Error(`Expected a move, got ${made.type}`);
  return made;
}

function resizeOf(event: EditEventDraft | null): Extract<EditEventDraft, { type: 'resize' }> {
  const made = strict(event);
  if (made.type !== 'resize') throw new Error(`Expected a resize, got ${made.type}`);
  return made;
}

function rotateOf(event: EditEventDraft | null): Extract<EditEventDraft, { type: 'rotate' }> {
  const made = strict(event);
  if (made.type !== 'rotate') throw new Error(`Expected a rotate, got ${made.type}`);
  return made;
}

function ringAt(view: GizmoView, degrees: number): Vec3 {
  const layout = gizmoLayout(view);
  if (layout === null) throw new Error('No gizmo');
  return along(layout.frame.centre, worldOfPlan(planDir(degrees)), layout.frame.metres);
}

describe('gizmo drags', () => {
  it('moves along the X arrow to the closest point of the pointer ray, snapped to the grid unless Alt', () => {
    const free = drag({ id: 'sofa', mode: 'move', look: 'angled', space: 'world' }, 'axis-x');
    const at = moveOf(
      free.to(along(along(free.handle.world, worldOfPlan(planDir(0)), 1.23), [0, 0, -1], 0.8), ALT),
    ).at;
    expect(at.y).toBeCloseTo(3, 9);
    expect(at.x).toBeGreaterThan(5.5);
    const exact = drag({ id: 'sofa', mode: 'move', space: 'world' }, 'axis-x');
    expect(
      moveOf(exact.to(along(exact.handle.world, worldOfPlan(planDir(0)), 1.23), ALT)).at.x,
    ).toBeCloseTo(6.23, 6);
    const snapped = drag({ id: 'sofa', mode: 'move', space: 'world' }, 'axis-x');
    expect(
      moveOf(snapped.to(along(snapped.handle.world, worldOfPlan(planDir(0)), 1.23))).at.x,
    ).toBeCloseTo(6.2, 9);
    const off = drag({ id: 'sofa', mode: 'move', space: 'world', snapping: false }, 'axis-x');
    expect(moveOf(off.to(along(off.handle.world, worldOfPlan(planDir(0)), 1.23))).at.x).toBeCloseTo(
      6.23,
      6,
    );
  });

  it('moves along the item turn in local space and along the compass in world space', () => {
    const local = drag({ id: 'chair', mode: 'move', space: 'local' }, 'axis-x');
    const moved = moveOf(local.to(along(local.handle.world, worldOfPlan(planDir(30)), 1), ALT));
    expect(moved.at.x).toBeCloseTo(5 + Math.cos(Math.PI / 6), 6);
    expect(moved.at.y).toBeCloseTo(3 + Math.sin(Math.PI / 6), 6);
    expect(moved.rotation).toBe(30);
    const world = drag({ id: 'chair', mode: 'move', space: 'world' }, 'axis-x');
    const target = along(world.handle.world, worldOfPlan(planDir(30)), 1);
    expect(moveOf(world.to(target, ALT)).at.y).toBeCloseTo(3, 9);
  });

  it('lifts along the up arrow and sends the new elevation', () => {
    const run = drag({ id: 'shelf', mode: 'move', look: 'angled' }, 'axis-z');
    const moved = moveOf(run.to(along(run.handle.world, UP, 0.4), ALT));
    expect(moved.elevation).toBeCloseTo(0.9, 6);
    expect(moved.height).toBeNull();
    expect(run.previews.at(-1)?.labels[0]?.text).toBe('0.90 m above floor');
  });

  it('slides a wall item along its wall on the along-wall arrow', () => {
    const run = drag({ id: 'tv', mode: 'move', look: 'angled', axes: ['y', 'z'] }, 'axis-y');
    const moved = moveOf(run.to(along(run.handle.world, worldOfPlan(planDir(0)), 1.5), ALT));
    expect(moved.wall?.wallId).toBe('north');
    expect(moved.wall?.offset).toBeCloseTo(3.5, 6);
    expect(moved.at.x).toBeCloseTo(3.5, 6);
  });

  it('moves on the floor with the plane square, keeping where it was grabbed', () => {
    const run = drag({ id: 'sofa', mode: 'move' }, 'plane');
    const plane = run.handle.world;
    const moved = moveOf(run.to([plane[0] + 1, plane[1], plane[2] - 0.5], ALT));
    expect(moved.at.x).toBeCloseTo(6, 6);
    expect(moved.at.y).toBeCloseTo(3.5, 6);
  });

  it('turns on the ring by the angle swept on its plane, in 15 degree steps unless Alt', () => {
    const snapped = drag({ id: 'sofa', mode: 'rotate', look: 'angled' }, 'ring');
    const turned = rotateOf(snapped.to(ringAt(snapped.view, 130)));
    expect(turned).toEqual({ type: 'rotate', id: 'sofa', degrees: 45 });
    expect(snapped.previews.at(-1)?.labels[0]?.text).toBe('45°');
    expect(snapped.previews.at(-1)?.pose.rotation).toBe(45);
    const free = drag({ id: 'sofa', mode: 'rotate', look: 'angled' }, 'ring');
    expect(rotateOf(free.to(ringAt(free.view, 130), ALT)).degrees).toBeCloseTo(40, 6);
  });

  it('resizes from a corner keeping the opposite corner still, snapped to the grid', () => {
    const run = drag({ id: 'table', mode: 'scale' }, 'corner', [1, 1]);
    const box = resizeOf(run.to(ground(6.43, 3.62))).box;
    expect(box.d).toBeCloseTo(2.4, 9);
    expect(box.w).toBeCloseTo(1.1, 9);
    expect(box.h).toBeNull();
    expect(box.at.x).toBeCloseTo(5.2, 9);
    expect(box.at.y).toBeCloseTo(3.05, 9);
    expect(run.previews.at(-1)?.size).toEqual({ w: box.w, d: box.d });
    expect(run.previews.at(-1)?.labels[0]?.text).toBe('1.10 × 2.40 m');
  });

  it('keeps the proportions of a corner drag with Shift', () => {
    const run = drag({ id: 'table', mode: 'scale' }, 'corner', [1, 1]);
    const box = resizeOf(run.to(ground(6.5, 3.5), SHIFT_ALT)).box;
    expect(box.d / box.w).toBeCloseTo(2, 9);
    expect(box.d).toBeCloseTo(2 + (0.5 * 4 + 0) / 5, 9);
    const snapped = drag({ id: 'table', mode: 'scale' }, 'corner', [1, 1]);
    const stepped = resizeOf(snapped.to(ground(6.53, 3.5), SHIFT)).box;
    expect(stepped.d).toBeCloseTo(2.4, 9);
    expect(stepped.w).toBeCloseTo(1.2, 9);
  });

  it('resizes one axis from a side handle', () => {
    const run = drag({ id: 'table', mode: 'scale' }, 'side', [0, 1]);
    const box = resizeOf(run.to(ground(5.7, 3.8), ALT)).box;
    expect(box.w).toBeCloseTo(1.3, 6);
    expect(box.d).toBe(2);
  });

  it('resizes the height from the top handle', () => {
    const run = drag({ id: 'table', mode: 'scale', look: 'angled' }, 'top');
    const box = resizeOf(run.to(along(run.handle.world, UP, 0.3), ALT)).box;
    expect(box.h).toBeCloseTo(1.05, 6);
    expect(box.w).toBe(1);
    expect(run.previews.at(-1)?.tall).toBeCloseTo(1.05, 6);
  });

  it('scales every size together from the uniform handle', () => {
    const run = drag({ id: 'table', mode: 'scale', look: 'angled' }, 'uniform');
    const [x, y, z] = run.handle.world;
    const box = resizeOf(run.to([5 + (x - 5) * 1.5, y, -3 + (z + 3) * 1.5], ALT)).box;
    expect(box.d).toBeCloseTo(3, 6);
    expect(box.w).toBeCloseTo(1.5, 6);
    expect(box.h).toBeCloseTo(1.125, 6);
    expect(box.at).toEqual({ x: 5, y: 3 });
  });

  it('clears the preview on cancel and ends without an edit', () => {
    const run = drag({ id: 'sofa', mode: 'move', space: 'world' }, 'axis-x');
    run.session.move(screenOf(run.view, ground(6, 3)), ALT);
    run.session.cancel();
    expect(run.previews.at(-1)).toBeNull();
    expect(run.session.end()).toBeNull();
    const still = drag({ id: 'sofa', mode: 'move' }, 'axis-y');
    expect(still.session.end()).toBeNull();
  });

  it('moves the item by its body like a body drag', () => {
    const view = gizmoView({ id: 'sofa', mode: 'move', look: 'top' });
    const previews: (GizmoPreview | null)[] = [];
    const start = gizmoDrags({ view: () => view, preview: (preview) => previews.push(preview) });
    const session = start({
      grab: { kind: 'body', id: 'sofa' },
      from: screenOf(view, ground(5, 3)),
      emit: () => undefined,
    });
    session.move(screenOf(view, ground(6, 4)), ALT);
    const { at } = moveOf(session.end());
    expect(at.x).toBeCloseTo(6, 6);
    expect(at.y).toBeCloseTo(4, 6);
    expect(previews.at(-1)?.tall).toBeNull();
  });

  it('refuses a handle that is not on the gizmo', () => {
    const view = gizmoView({ id: 'sofa', mode: 'move' });
    const start = gizmoDrags({ view: () => view, preview: () => undefined });
    expect(() =>
      start({
        grab: { kind: 'handle', handleId: 'gone' },
        from: { x: 0, y: 0 },
        emit: () => undefined,
      }),
    ).toThrow(HandleDragUnavailableError);
  });
});

describe('edge-on ring', () => {
  it('measures the turn on the screen around the projected centre when seen from the side', () => {
    const view = gizmoView({ id: 'sofa', mode: 'rotate', look: 'side' });
    const ring = handleOf(view, 'ring');
    const centre = gizmoLayout(view)?.frame.screen;
    if (centre === undefined) throw new Error('No gizmo');
    const start = gizmoDrags({ view: () => view, preview: () => undefined });
    const session = start({
      grab: { kind: 'handle', handleId: ring.id },
      from: { x: centre.x + 40, y: centre.y },
      emit: () => undefined,
    });
    session.move({ x: centre.x, y: centre.y - 40 }, NO_MODIFIERS);
    expect(rotateOf(session.end())).toEqual({ type: 'rotate', id: 'sofa', degrees: 90 });
    session.move({ x: centre.x + 40, y: centre.y + 40 }, ALT);
    expect(rotateOf(session.end()).degrees).toBeCloseTo(315, 6);
  });
});

interface RoomRun {
  readonly view: GizmoView;
  readonly previews: (EditPreview | null)[];
  readonly to: (world: Vec3, modifiers?: Modifiers) => EditEventDraft | null;
}

function roomDrag(given: GizmoCase, grab: (view: GizmoView) => DragGrab, from: Vec3): RoomRun {
  const view = { ...gizmoView(given), scan: null };
  const previews: (EditPreview | null)[] = [];
  const start = editDrags({
    view: () => view,
    preview: (preview) => previews.push(preview),
    active: () => undefined,
  });
  const session = start({ grab: grab(view), from: screenOf(view, from), emit: () => undefined });
  return {
    view,
    previews,
    to: (world, modifiers = NO_MODIFIERS): EditEventDraft | null => {
      session.move(screenOf(view, world), modifiers);
      return session.end();
    },
  };
}

function roomMoveOf(event: EditEventDraft | null): Extract<EditEventDraft, { type: 'room-move' }> {
  const made = strict(event);
  if (made.type !== 'room-move') throw new Error(`Expected a room move, got ${made.type}`);
  return made;
}

const LIVING: GizmoCase = { id: 'living', mode: 'move' };

describe('room drags', () => {
  it('moves a room along its X arrow by grid steps and previews the moved outline', () => {
    const view = gizmoView(LIVING);
    const arrow = handleOf(view, 'axis-x').world;
    const run = roomDrag(
      LIVING,
      (each) => ({ kind: 'handle', handleId: handleOf(each, 'axis-x').id }),
      arrow,
    );
    const moved = roomMoveOf(run.to([arrow[0] + 1.23, arrow[1], arrow[2] - 0.4]));
    expect(moved.id).toBe('living');
    expect(moved.by.x).toBeCloseTo(1.2, 9);
    expect(moved.by.y).toBeCloseTo(0, 9);
    const last = run.previews.at(-1);
    if (last?.family !== 'shape') throw new Error('Expected an outline preview');
    expect(last.preview.ghosts[0]?.points[0]?.x).toBeCloseTo(1.2, 9);
    expect(last.preview.ghosts[0]?.points[0]?.height).toBe(0);
  });

  it('moves a room freely on the floor square with Alt', () => {
    const view = gizmoView(LIVING);
    const square = handleOf(view, 'plane').world;
    const run = roomDrag(
      LIVING,
      (each) => ({ kind: 'handle', handleId: handleOf(each, 'plane').id }),
      square,
    );
    const moved = roomMoveOf(run.to([square[0] + 1.23, square[1], square[2] - 0.4], ALT));
    expect(moved.by.x).toBeCloseTo(1.23, 6);
    expect(moved.by.y).toBeCloseTo(0.4, 6);
  });

  it('moves a room by its body and sends nothing when it ends where it started', () => {
    const run = roomDrag(LIVING, () => ({ kind: 'body', id: 'living' }), ground(5, 3));
    const moved = roomMoveOf(run.to(ground(6.04, 2.38)));
    expect(moved.by.x).toBeCloseTo(1, 9);
    expect(moved.by.y).toBeCloseTo(-0.6, 9);
    expect(run.to(ground(5.02, 3.01))).toBeNull();
  });

  it('refuses the rotate ring on a room', () => {
    const view = { ...gizmoView({ id: 'living', mode: 'rotate' }), scan: null };
    const start = editDrags({
      view: () => view,
      preview: () => undefined,
      active: () => undefined,
    });
    expect(() =>
      start({
        grab: { kind: 'handle', handleId: 'gizmo:ring:0:0' },
        from: { x: 0, y: 0 },
        emit: () => undefined,
      }),
    ).toThrow(HandleDragUnavailableError);
  });
});
