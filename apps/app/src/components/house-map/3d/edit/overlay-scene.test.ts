import { HOME_MAP_WALL_ID } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import type { EditOverlay } from '../map-3d-edit-protocol';
import { GIZMO_SIZES, type GizmoView } from './gizmo';
import { EDIT, gizmoView, type GizmoCase } from './gizmo-fixture';
import { wallFaceOf } from './overlay-surfaces';
import { gizmoHandleId } from './gizmo-handles';
import {
  IDLE_DRAG,
  LIVE_PILL_GAP_PX,
  PICKED_UP_TEXT,
  PILL_HEIGHT_PX,
  HOVER_GROWTH,
  boxesOverlap,
  gizmoBreakpointOf,
  pillBox,
  targetBox,
  underHandles,
  type Box,
  type DrawnHandle,
  type OverlayDrag,
  type OverlayScene,
} from './overlay-model';
import { overlaySceneOf, type OverlayInput } from './overlay-scene';
import type { EditPreview } from './edit-drags';

function sceneOf(
  given: GizmoCase,
  drag: OverlayDrag = IDLE_DRAG,
  pickUp: string | null = null,
): OverlayScene {
  return overlaySceneOf(inputOf(gizmoView(given), drag, pickUp));
}

function inputOf(
  view: GizmoView,
  drag: OverlayDrag = IDLE_DRAG,
  pickUp: string | null = null,
  extra: Partial<OverlayInput> = {},
): OverlayInput {
  return { view, drag, pickUp, hover: null, touches: null, avoid: [], ...extra };
}

function withOverlay(given: GizmoCase, change: Partial<EditOverlay>): GizmoView {
  const view = gizmoView(given);
  return { ...view, overlay: { ...view.overlay, ...change } };
}

function handle(scene: OverlayScene, id: string): DrawnHandle {
  const found = scene.handles.find((each) => each.id === id);
  if (found === undefined) throw new Error(`No drawn handle ${id}`);
  return found;
}

function around(x: number, y: number, half: number): Box {
  return { left: x - half, right: x + half, top: y - half, bottom: y + half };
}

const TOUCHING_EPS = 1e-6;

function inset(box: Box): Box {
  return {
    left: box.left + TOUCHING_EPS,
    right: box.right - TOUCHING_EPS,
    top: box.top + TOUCHING_EPS,
    bottom: box.bottom - TOUCHING_EPS,
  };
}

const MOVE_X = gizmoHandleId('axis-x', [0, 0]);
const RING = gizmoHandleId('ring', [0, 0]);

const MOVED: EditPreview = {
  family: 'move',
  preview: {
    pose: { id: 'table', at: { x: 6, y: 3 }, rotation: 0, height: 0, wall: null },
    size: null,
    guides: [
      {
        shape: 'polyline',
        points: [
          { x: 6, y: 0, height: 0 },
          { x: 6, y: 6, height: 0 },
        ],
        tone: 'snap',
      },
    ],
    labels: [
      { at: { x: 6, y: 3, height: 0.75 }, text: '1.00 m', tone: 'neutral' },
      { at: { x: 6, y: 3, height: 0 }, text: 'snaps to the shelf', tone: 'snap' },
    ],
  },
};

describe('the edit overlay model', () => {
  it('draws phone handles 24 px with 48 px targets and desktop handles 16 px with 44 px targets', () => {
    const phone = sceneOf({ id: 'table', mode: 'scale', look: 'angled' });
    const desktop = sceneOf({ id: 'table', mode: 'scale', look: 'angled', breakpoint: 'desktop' });
    expect(phone.handles.length).toBeGreaterThan(0);
    expect(phone.handles.every((each) => each.size === 24 && each.target === 48)).toBe(true);
    expect(desktop.handles.every((each) => each.size === 16 && each.target === 44)).toBe(true);
    expect(GIZMO_SIZES.phone.handlePx).toBe(24);
  });

  it('never overlaps two handle targets in any mode on a phone', () => {
    for (const mode of ['move', 'rotate', 'scale'] as const) {
      for (const look of ['top', 'angled'] as const) {
        const { handles } = sceneOf({ id: 'sofa', mode, look });
        const boxes = handles.map((each) => inset(targetBox(each)));
        const clashes = boxes.filter((box, index) =>
          boxes.some((other, at) => at > index && boxesOverlap(box, other)),
        );
        expect(clashes).toEqual([]);
      }
    }
  });

  it('shows only the current mode', () => {
    const kinds = (mode: GizmoCase['mode']): ReadonlySet<string> =>
      new Set(sceneOf({ id: 'table', mode, look: 'angled' }).handles.map((each) => each.kind));
    expect([...kinds('move')].sort()).toEqual(['axis-x', 'axis-y', 'axis-z', 'plane']);
    expect([...kinds('rotate')]).toEqual(['ring']);
    expect(kinds('scale').has('corner')).toBe(true);
    expect(kinds('scale').has('axis-x')).toBe(false);
  });

  it('draws the whole ring and makes it a grab band that room labels give way to', () => {
    const scene = sceneOf({ id: 'table', mode: 'rotate', look: 'top' });
    expect(scene.paths.some((path) => path.look === 'ring')).toBe(true);
    expect(scene.yieldTo.discs.length).toBeGreaterThan(8);
    const knob = handle(scene, RING);
    expect(underHandles(scene.yieldTo, around(knob.x, knob.y + 40, 4))).toBe(false);
    const band = scene.yieldTo.discs.at(-1);
    if (band === undefined) throw new Error('no band');
    expect(underHandles(scene.yieldTo, around(band.x, band.y, 2))).toBe(true);
  });

  it('hides room labels under a handle target and keeps the rest, and fades chips in select', () => {
    const scene = sceneOf({ id: 'table', mode: 'move', look: 'top' });
    const tip = handle(scene, MOVE_X);
    expect(underHandles(scene.yieldTo, around(tip.x, tip.y, 10))).toBe(true);
    expect(underHandles(scene.yieldTo, around(5, 5, 10))).toBe(false);
    expect(scene.yieldTo.hideLabels).toBe(false);
    expect(scene.yieldTo.chips).toBe('fade');
  });

  it('hides chips under draft knobs while drawing', () => {
    const view = withOverlay(
      { id: 'table', mode: 'move' },
      {
        mode: 'draw-points',
        selection: [],
        gizmo: null,
        handles: [
          {
            id: 'k1',
            kind: 'point',
            at: { x: 5, y: 3, height: 0 },
            surface: { kind: 'ground' },
            target: { kind: 'rect-corner', anchor: { x: 5, y: 3 } },
          },
        ],
      },
    );
    const scene = overlaySceneOf(inputOf(view));
    expect(scene.handles.map((each) => each.id)).toEqual(['k1']);
    expect(scene.yieldTo.chips).toBe('hide');
  });

  it('draws nothing to grab while read only', () => {
    const view = withOverlay(
      { id: 'table', mode: 'move', readOnly: true },
      {
        handles: [
          {
            id: 'k1',
            kind: 'point',
            at: { x: 5, y: 3, height: 0 },
            surface: { kind: 'ground' },
            target: { kind: 'rect-corner', anchor: { x: 5, y: 3 } },
          },
        ],
      },
    );
    const scene = overlaySceneOf(inputOf(view));
    expect(scene.handles).toEqual([]);
    expect(scene.yieldTo.discs).toEqual([]);
  });

  it('fills the dragged handle, fades the others, shows the axis guide and hides room labels', () => {
    const drag: OverlayDrag = { grab: { kind: 'handle', handleId: MOVE_X }, preview: null };
    const scene = sceneOf({ id: 'table', mode: 'move', look: 'angled' }, drag);
    expect(handle(scene, MOVE_X).state).toBe('active');
    const others = scene.handles.filter((each) => each.id !== MOVE_X);
    expect(others.length).toBeGreaterThan(0);
    expect(others.every((each) => each.state === 'faded')).toBe(true);
    expect(scene.paths.some((path) => path.look === 'axis-guide')).toBe(true);
    expect(scene.yieldTo.hideLabels).toBe(true);
  });

  it('shows ticks and the swept wedge while turning the ring', () => {
    const drag: OverlayDrag = { grab: { kind: 'handle', handleId: RING }, preview: null };
    const scene = sceneOf({ id: 'table', mode: 'rotate', look: 'top' }, drag);
    expect(scene.paths.filter((path) => path.look.startsWith('tick'))).toHaveLength(24);
    expect(scene.paths.filter((path) => path.look === 'tick-major')).toHaveLength(4);
    expect(scene.paths.some((path) => path.look === 'wedge')).toBe(true);
  });

  it('moves the gizmo with the drag preview and puts the live pill above it with the snap label', () => {
    const still = sceneOf({ id: 'table', mode: 'move', look: 'top' });
    const drag: OverlayDrag = { grab: { kind: 'body', id: 'table' }, preview: MOVED };
    const moving = sceneOf({ id: 'table', mode: 'move', look: 'top' }, drag);
    expect(handle(moving, MOVE_X).x).toBeGreaterThan(handle(still, MOVE_X).x + 10);
    const live = moving.pills.find((pill) => pill.look === 'live');
    const snap = moving.pills.find((pill) => pill.look === 'snap');
    expect(live?.text).toBe('1.00 m');
    expect(snap?.text).toBe('snaps to the shelf');
    const top = Math.min(...moving.handles.map((each) => each.y - each.size / 2));
    expect(live?.y).toBeCloseTo(top - LIVE_PILL_GAP_PX - PILL_HEIGHT_PX / 2, 0);
    expect(moving.paths.some((path) => path.look === 'ghost' && path.tone === 'snap')).toBe(true);
  });

  it('pulses and shows the pick-up tip only while an item is held and not yet dragged', () => {
    const held = sceneOf({ id: 'table', mode: 'move', look: 'top' }, IDLE_DRAG, 'table');
    expect(held.pulse).not.toBeNull();
    expect(held.pills.map((pill) => pill.text)).toContain(PICKED_UP_TEXT);
    const dragging = sceneOf(
      { id: 'table', mode: 'move', look: 'top' },
      { grab: { kind: 'body', id: 'table' }, preview: null },
      'table',
    );
    expect(dragging.pulse).toBeNull();
  });

  it('names every handle for screen readers', () => {
    const scene = sceneOf({ id: 'table', mode: 'scale', look: 'angled' });
    expect(scene.handles.every((each) => each.label.length > 0)).toBe(true);
  });

  it('picks the gizmo breakpoint from the window width', () => {
    expect(gizmoBreakpointOf(375)).toBe('phone');
    expect(gizmoBreakpointOf(884)).toBe('tablet');
    expect(gizmoBreakpointOf(1440)).toBe('desktop');
  });
});

describe('the edit overlay surfaces and feedback', () => {
  it('grows the hovered handle 1.3 times and shows grab, then grabbing while dragging', () => {
    const view = gizmoView({ id: 'table', mode: 'move', breakpoint: 'desktop' });
    const hover = { kind: 'handle', handleId: MOVE_X } as const;
    const scene = overlaySceneOf(inputOf(view, IDLE_DRAG, null, { hover }));
    const size = GIZMO_SIZES.desktop.handlePx;
    expect(handle(scene, MOVE_X).state).toBe('hover');
    expect(handle(scene, MOVE_X).size).toBeCloseTo(size * HOVER_GROWTH, 6);
    expect(handle(scene, MOVE_X).target).toBe(GIZMO_SIZES.desktop.targetPx);
    expect(
      scene.handles.filter((each) => each.id !== MOVE_X).every((each) => each.size === size),
    ).toBe(true);
    expect(scene.cursor).toBe('grab');
    const drag: OverlayDrag = { grab: { kind: 'handle', handleId: MOVE_X }, preview: null };
    expect(overlaySceneOf(inputOf(view, drag, null, { hover })).cursor).toBe('grabbing');
    expect(sceneOf({ id: 'table', mode: 'move' }).cursor).toBeNull();
  });

  it('draws a wall face ghost on each asked face at full wall height in its tone', () => {
    const view = withOverlay(
      { id: 'table', mode: 'move', look: 'angled' },
      { ghosts: [{ shape: 'wall-face', wallId: 'north', face: 'both', tone: 'info' }] },
    );
    const faces = overlaySceneOf(inputOf(view)).paths.filter((path) => path.look === 'face');
    expect(faces.map((path) => path.tone)).toEqual(['info', 'info']);
    expect(faces.every((path) => path.d.split('L').length === 4 && path.d.endsWith('Z'))).toBe(
      true,
    );
    expect(wallFaceOf(EDIT, 'north', 'left')?.map((point) => point.height)).toEqual([
      0, 0, 2.6, 2.6,
    ]);
  });

  it('tints the floor or wall face under the pointer in paint mode only', () => {
    const view = withOverlay(
      { id: 'table', mode: 'move' },
      { mode: 'paint', paint: { surface: 'floor' } },
    );
    const floor = { kind: 'paint', target: { kind: 'floor', roomId: 'living' } } as const;
    const tinted = overlaySceneOf(inputOf(view, IDLE_DRAG, null, { hover: floor })).paths;
    expect(tinted.filter((path) => path.look === 'tint')).toHaveLength(1);
    const wall = {
      kind: 'paint',
      target: { kind: 'wall', wallId: 'south', side: 'left' },
    } as const;
    expect(
      overlaySceneOf(inputOf(view, IDLE_DRAG, null, { hover: wall })).paths.some(
        (path) => path.look === 'tint',
      ),
    ).toBe(true);
    const select = gizmoView({ id: 'table', mode: 'move' });
    expect(
      overlaySceneOf(inputOf(select, IDLE_DRAG, null, { hover: floor })).paths.some(
        (path) => path.look === 'tint',
      ),
    ).toBe(false);
  });

  it('draws the dashed footprint of an armed piece and the landing ring of an armed wall device', () => {
    const at = { x: 3, y: 2 };
    const spot = { at, height: 0, rotation: 0, surface: { kind: 'ground' }, wall: null } as const;
    const piece = withOverlay(
      { id: 'table', mode: 'move' },
      { mode: 'place', place: { kind: 'object', footprint: { w: 0.8, d: 0.9 }, rotation: 0 } },
    );
    const ghost = overlaySceneOf(
      inputOf(piece, IDLE_DRAG, null, { hover: { kind: 'place', spot } }),
    );
    expect(ghost.paths.filter((path) => path.look === 'place')).toHaveLength(1);
    const device = withOverlay(
      { id: 'table', mode: 'move' },
      { mode: 'place', place: { kind: 'device', mount: 'wall', height: 1.2 } },
    );
    const wall = { wallId: HOME_MAP_WALL_ID.parse('north'), offset: 3, side: 'right' } as const;
    const onWall = {
      ...spot,
      at: { x: 3, y: 5.95 },
      height: 1.2,
      surface: { kind: 'wall', wallId: 'north' },
      wall,
    } as const;
    const ring = overlaySceneOf(
      inputOf(device, IDLE_DRAG, null, { hover: { kind: 'place', spot: onWall } }),
    );
    expect(ring.paths.map((path) => path.look)).toEqual(
      expect.arrayContaining(['landing', 'face']),
    );
    expect(ring.pills.map((pill) => pill.text)).toContain('1.20 m above floor');
  });

  it('hides the gizmo during a two finger twist and shows two touch discs and the turn and size pill', () => {
    const view = gizmoView({ id: 'table', mode: 'move' });
    const pose = { id: 'table', at: { x: 5, y: 3 }, rotation: 30, height: 0, wall: null };
    const preview: EditPreview = {
      family: 'move',
      preview: { pose, size: { w: 2.4, d: 0.98 }, guides: [], labels: [] },
    };
    const drag: OverlayDrag = { grab: { kind: 'body', id: 'table' }, preview };
    const touches = [
      { x: 150, y: 400 },
      { x: 240, y: 440 },
    ] as const;
    const scene = overlaySceneOf(inputOf(view, drag, null, { touches }));
    expect(scene.handles).toEqual([]);
    expect(scene.touches).toEqual([
      { x: 150, y: 400, r: 22 },
      { x: 240, y: 440, r: 22 },
    ]);
    expect(scene.pills.find((pill) => pill.key === 'twist')?.text).toBe('Turn 30°  2.40 × 0.98 m');
    expect(scene.yieldTo.hideLabels).toBe(true);
  });

  it('slides a measure pill along its guide off a chip and keeps a clear one where it is', () => {
    const line = [
      { x: 2, y: 3, height: 0 },
      { x: 8, y: 3, height: 0 },
    ];
    const label = { at: { x: 5, y: 3, height: 0 }, text: '6.00 m', tone: 'neutral' } as const;
    const view = withOverlay(
      { id: 'table', mode: 'move' },
      {
        selection: [],
        gizmo: null,
        ghosts: [{ shape: 'polyline', points: line, tone: 'neutral' }],
        labels: [label],
      },
    );
    const clear = overlaySceneOf(inputOf(view)).pills.find((pill) => pill.look === 'label');
    if (clear === undefined) throw new Error('No measure pill');
    const chip = {
      left: clear.x - 20,
      right: clear.x + 20,
      top: clear.y - 10,
      bottom: clear.y + 10,
    };
    const moved = overlaySceneOf(inputOf(view, IDLE_DRAG, null, { avoid: [chip] })).pills.find(
      (pill) => pill.look === 'label',
    );
    expect(moved?.y).toBeCloseTo(clear.y, 6);
    expect(moved?.x).not.toBeCloseTo(clear.x, 0);
    expect(moved === undefined ? true : boxesOverlap(pillBox(moved), chip)).toBe(false);
  });
});
