import { describe, expect, it } from 'vitest';
import type { Point } from '../render-core-gestures';
import {
  AXIS_HIDE_DEG,
  GIZMO_SIZES,
  UP,
  along,
  clearAlong,
  gizmoFrameOf,
  handleAt,
  planDir,
  viewAngleDeg,
  worldOfPlan,
  type GizmoFrame,
  type GizmoView,
} from './gizmo';
import { LAMP, gizmoView, screenOf, type GizmoCase, type Look } from './gizmo-fixture';
import {
  SCALE_HALF_TARGETS,
  gizmoCentres,
  gizmoHandleId,
  gizmoLayout,
  type GizmoHandle,
  type GizmoKind,
  type GizmoLayout,
} from './gizmo-handles';

const PIXEL = 0.5;
const PHONE_TARGET = GIZMO_SIZES.phone.targetPx;

function layoutOf(given: GizmoCase): GizmoLayout {
  const layout = gizmoLayout(gizmoView(given));
  if (layout === null) throw new Error(`No gizmo for ${given.id}`);
  return layout;
}

function kinds(layout: GizmoLayout): readonly GizmoKind[] {
  return layout.handles.map((handle) => handle.kind);
}

function only(layout: GizmoLayout, kind: GizmoKind): GizmoHandle {
  const found = layout.handles.filter((handle) => handle.kind === kind);
  const [first] = found;
  if (first === undefined || found.length !== 1) throw new Error(`Expected one ${kind} handle`);
  return first;
}

function gapOf(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function apart(a: Point, b: Point, size: number): boolean {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) >= size - 1e-6;
}

function frameOf(view: GizmoView): GizmoFrame {
  const frame = gizmoFrameOf(view);
  if (frame === null) throw new Error('No gizmo frame');
  return frame;
}

describe('gizmo handles', () => {
  it('draws the move arrows the gizmo size long on screen with the plane square between them in Top', () => {
    const layout = layoutOf({ id: 'sofa', mode: 'move' });
    const { screen } = layout.frame;
    expect(kinds(layout)).toEqual(['axis-x', 'axis-y', 'plane']);
    const east = only(layout, 'axis-x').screen;
    const north = only(layout, 'axis-y').screen;
    expect(gapOf(screen, east)).toBeCloseTo(GIZMO_SIZES.phone.gizmoPx, 0);
    expect(gapOf(screen, north)).toBeCloseTo(GIZMO_SIZES.phone.gizmoPx, 0);
    expect(east.x - screen.x).toBeGreaterThan(GIZMO_SIZES.phone.gizmoPx - 1);
    expect(screen.y - north.y).toBeGreaterThan(GIZMO_SIZES.phone.gizmoPx - 1);
    const plane = only(layout, 'plane').screen;
    expect(plane.x).toBeGreaterThan(screen.x);
    expect(plane.y).toBeLessThan(screen.y);
    for (const other of [screen, east, north]) expect(apart(plane, other, PHONE_TARGET)).toBe(true);
  });

  it('keeps the gizmo the same size on screen near and far, so its length in metres grows with distance', () => {
    const near = layoutOf({ id: 'sofa', mode: 'move', look: 'top' });
    const far = layoutOf({ id: 'sofa', mode: 'move', look: 'far' });
    for (const layout of [near, far]) {
      const tip = only(layout, 'axis-x').screen;
      expect(Math.abs(gapOf(layout.frame.screen, tip) - GIZMO_SIZES.phone.gizmoPx)).toBeLessThan(
        PIXEL,
      );
    }
    expect(far.frame.metres).toBeGreaterThan(near.frame.metres * 2);
  });

  it('sizes the gizmo per breakpoint', () => {
    const desktop = layoutOf({ id: 'sofa', mode: 'move', breakpoint: 'desktop' });
    const tip = only(desktop, 'axis-x').screen;
    expect(gapOf(desktop.frame.screen, tip)).toBeCloseTo(GIZMO_SIZES.desktop.gizmoPx, 0);
    expect(desktop.frame.sizes).toEqual(GIZMO_SIZES.desktop);
  });

  it('hides the up arrow in Top because it points at the camera, and shows it angled', () => {
    const top = gizmoView({ id: 'sofa', mode: 'move', look: 'top' });
    expect(viewAngleDeg(top, frameOf(top).centre, UP)).toBeLessThan(AXIS_HIDE_DEG);
    expect(kinds(layoutOf({ id: 'sofa', mode: 'move', look: 'top' }))).not.toContain('axis-z');
    const angled = layoutOf({ id: 'sofa', mode: 'move', look: 'angled' });
    expect(kinds(angled)).toEqual(['axis-x', 'axis-y', 'axis-z', 'plane']);
    const up = only(angled, 'axis-z');
    expect(up.screen.y).toBeLessThan(angled.frame.screen.y);
    expect(up.world[1]).toBeGreaterThan(angled.frame.centre[1]);
  });

  it('places the move handles of an angled view so no two targets overlap', () => {
    for (const look of ['angled', 'side'] as const) {
      const handles = layoutOf({ id: 'sofa', mode: 'move', look }).handles;
      for (const [index, a] of handles.entries()) {
        for (const b of handles.slice(index + 1)) {
          expect(apart(a.screen, b.screen, PHONE_TARGET)).toBe(true);
        }
      }
    }
  });

  it('leaves out the axes the overlay does not offer and the plane without both floor axes', () => {
    const wallMove = layoutOf({ id: 'tv', mode: 'move', look: 'angled', axes: ['y', 'z'] });
    expect(kinds(wallMove)).toEqual(['axis-y', 'axis-z']);
  });

  it('follows the item turn in local space and the compass in world space', () => {
    const local = layoutOf({ id: 'chair', mode: 'move', space: 'local' });
    const world = layoutOf({ id: 'chair', mode: 'move', space: 'world' });
    const turned = along(local.frame.centre, worldOfPlan(planDir(30)), local.frame.metres);
    const east = along(world.frame.centre, worldOfPlan(planDir(0)), world.frame.metres);
    only(local, 'axis-x').world.forEach((value, index) => {
      expect(value).toBeCloseTo(turned[index] ?? Number.NaN, 9);
    });
    only(world, 'axis-x').world.forEach((value, index) => {
      expect(value).toBeCloseTo(east[index] ?? Number.NaN, 9);
    });
  });

  it('makes the whole rotate ring a grab band one target wide', () => {
    const view = gizmoView({ id: 'sofa', mode: 'rotate', look: 'angled' });
    const layout = layoutOf({ id: 'sofa', mode: 'rotate', look: 'angled' });
    const ring = only(layout, 'ring');
    const centres = gizmoCentres(layout);
    const { frame } = layout;
    for (let step = 0; step < 24; step += 1) {
      const angle = (step / 24) * Math.PI * 2 + 0.1;
      const offset = worldOfPlan({ x: Math.cos(angle), y: Math.sin(angle) });
      const onRing = screenOf(view, along(frame.centre, offset, frame.metres));
      const dir = { x: onRing.x - frame.screen.x, y: onRing.y - frame.screen.y };
      const length = Math.hypot(dir.x, dir.y);
      for (const radial of [-20, 0, 20]) {
        const at = {
          x: onRing.x + (dir.x / length) * radial,
          y: onRing.y + (dir.y / length) * radial,
        };
        expect(handleAt(centres, at, false)).toBe(ring.id);
      }
    }
    expect(handleAt(centres, frame.screen, false)).toBeNull();
  });

  it('puts the ring knob at the item north', () => {
    const layout = layoutOf({ id: 'chair', mode: 'rotate' });
    const north = along(layout.frame.centre, worldOfPlan(planDir(120)), layout.frame.metres);
    only(layout, 'ring').world.forEach((value, index) => {
      expect(value).toBeCloseTo(north[index] ?? Number.NaN, 9);
    });
  });

  it('keeps the ring seen edge-on from the side and hides the ring of a wall mounted item', () => {
    expect(kinds(layoutOf({ id: 'sofa', mode: 'rotate', look: 'side' }))).toEqual(['ring']);
    expect(kinds(layoutOf({ id: 'tv', mode: 'rotate', look: 'angled' }))).toEqual([]);
    expect(kinds(layoutOf({ id: 'sofa', mode: 'rotate', look: 'top' }))).toEqual(['ring']);
  });

  it('gives a room a move gizmo with the floor arrows and square only', () => {
    for (const look of ['top', 'angled'] as const) {
      const layout = layoutOf({ id: 'living', mode: 'move', look });
      expect(layout.subject).toEqual({ kind: 'room', roomId: 'living' });
      expect(kinds(layout)).toEqual(['axis-x', 'axis-y', 'plane']);
      expect(layout.scale).toBeNull();
    }
    expect(kinds(layoutOf({ id: 'living', mode: 'rotate', look: 'angled' }))).toEqual([]);
    expect(kinds(layoutOf({ id: 'living', mode: 'scale', look: 'angled' }))).toEqual([]);
    expect(kinds(layoutOf({ id: 'living', mode: 'move', axes: ['x'] }))).toEqual(['axis-x']);
  });

  it('grows the scale frame of a small sofa to one and a half targets per side on screen', () => {
    for (const look of ['top', 'angled'] as const) {
      const view = gizmoView({ id: 'sofa', mode: 'scale', look });
      const layout = layoutOf({ id: 'sofa', mode: 'scale', look });
      const { scale, frame } = layout;
      if (scale === null) throw new Error('No scale frame');
      expect(scale.grown).toBe(true);
      const least = SCALE_HALF_TARGETS * PHONE_TARGET - PIXEL;
      for (const [dir, half] of [
        [planDir(0), scale.half.x],
        [planDir(90), scale.half.y],
      ] as const) {
        for (const sign of [1, -1]) {
          const end = screenOf(view, along(frame.centre, worldOfPlan(dir), sign * half));
          expect(gapOf(end, frame.screen)).toBeGreaterThan(least);
        }
      }
    }
  });

  it('never overlaps two targets of a 0.3 m sofa on a phone in any mode', () => {
    const looks: readonly Look[] = ['top', 'angled'];
    for (const look of looks) {
      for (const mode of ['move', 'rotate', 'scale'] as const) {
        const handles = layoutOf({ id: 'sofa', mode, look }).handles;
        const centre = layoutOf({ id: 'sofa', mode, look }).frame.screen;
        for (const [index, a] of handles.entries()) {
          if (a.kind !== 'ring') expect(apart(a.screen, centre, PHONE_TARGET)).toBe(true);
          for (const b of handles.slice(index + 1)) {
            expect(apart(a.screen, b.screen, PHONE_TARGET)).toBe(true);
          }
        }
      }
    }
  });

  it('shows side handles on a big table and keeps its frame at its real size', () => {
    const layout = layoutOf({ id: 'table', mode: 'scale' });
    expect(layout.scale?.grown).toBe(false);
    expect(kinds(layout).filter((kind) => kind === 'corner')).toHaveLength(4);
    expect(kinds(layout).filter((kind) => kind === 'side')).toHaveLength(4);
    const corner = layout.handles.find((handle) => handle.id === gizmoHandleId('corner', [1, 1]));
    expect(corner?.world[0]).toBeCloseTo(6, 9);
    expect(corner?.world[2]).toBeCloseTo(-3.5, 9);
  });

  it('puts the uniform handle outside the corner nearest the top right of the screen', () => {
    const layout = layoutOf({ id: 'table', mode: 'scale', look: 'angled' });
    const corners = layout.handles.filter((handle) => handle.kind === 'corner');
    const best = Math.max(...corners.map((handle) => handle.screen.x - handle.screen.y));
    const uniform = only(layout, 'uniform');
    const anchor = corners.find((handle) => handle.screen.x - handle.screen.y === best);
    expect(uniform.signs).toEqual(anchor?.signs);
    expect(gapOf(uniform.screen, layout.frame.screen)).toBeGreaterThan(
      gapOf(anchor?.screen ?? layout.frame.screen, layout.frame.screen),
    );
  });

  it('shows the height handle above the frame only when the up axis does not face the camera', () => {
    expect(kinds(layoutOf({ id: 'table', mode: 'scale', look: 'top' }))).not.toContain('top');
    const angled = layoutOf({ id: 'table', mode: 'scale', look: 'angled' });
    expect(only(angled, 'top').world[1]).toBeGreaterThan(0.75);
  });

  it('gives no gizmo while read only, and no scale handles to a device', () => {
    expect(gizmoLayout(gizmoView({ id: 'sofa', mode: 'move', readOnly: true }))).toBeNull();
    expect(kinds(layoutOf({ id: LAMP, mode: 'scale' }))).toEqual([]);
    expect(gizmoCentres(null)).toEqual([]);
  });

  it('names every handle target as the gizmo of the selected item', () => {
    const layout = layoutOf({ id: 'table', mode: 'scale', look: 'angled' });
    for (const handle of layout.handles)
      expect(handle.target).toEqual({ kind: 'gizmo', id: 'table' });
  });
});

describe('clearAlong', () => {
  it('moves past every blocker whose target square it would overlap', () => {
    const path = { start: { x: 0, y: 0 }, dir: { x: 1, y: 0 }, from: 0 };
    expect(clearAlong(path, [{ x: 10, y: 5 }], 20)).toBe(30);
    expect(clearAlong(path, [{ x: 10, y: 25 }], 20)).toBe(0);
    expect(
      clearAlong(
        path,
        [
          { x: 10, y: 0 },
          { x: 40, y: 0 },
        ],
        20,
      ),
    ).toBe(60);
  });
});
