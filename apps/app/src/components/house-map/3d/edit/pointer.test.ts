import { HOME_MAP_WALL_ID } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import type { Modifiers, PinchTwist } from '../../edit/gestures';
import {
  NO_EDIT_OVERLAY,
  type EditEvent,
  type EditHit,
  type EditOverlay,
  type EditPaintTarget,
} from '../map-3d-edit-protocol';
import {
  GestureTracker,
  TAP_SLOP_PIXELS,
  type Point,
  type PointerSample,
} from '../render-core-gestures';
import {
  EditPointer,
  GESTURE_HANDLER_LONG_PRESS_MS,
  type DragSession,
  type DragStart,
  type EditEventDraft,
  type GroundTap,
  type HandleCentre,
  type PlaceSpot,
  type PointerHover,
} from './pointer';
import { HANDLE_TARGET_PX, handleAt } from './gizmo';
import { placeSpotAt } from './pointer-place';
import { EDIT, gizmoView, ground, screenOf } from './gizmo-fixture';
import type { PressPick } from '../render-core-pick';
import {
  EditingUnavailableError,
  SceneEditing,
  type EditSource,
  type SceneEdit,
} from './pointer-scene';
import type { RenderFloor } from '../../render-scene';
import type { Vec3 } from '../mesh';

interface Region {
  readonly hit: EditHit;
  readonly left: number;
  readonly right: number;
}

const SOFA: Region = { hit: { kind: 'object', id: 'sofa', locked: false }, left: 100, right: 200 };
const SAFE: Region = { hit: { kind: 'object', id: 'safe', locked: true }, left: 300, right: 400 };
const LAMP: Region = { hit: { kind: 'device', id: 'lamp' }, left: 500, right: 600 };
const KITCHEN: Region = { hit: { kind: 'room', id: 'kitchen' }, left: 700, right: 800 };
const REGIONS = [SOFA, SAFE, LAMP, KITCHEN];

const STAGE_LEFT = 10;

const SELECTED: EditOverlay = {
  ...NO_EDIT_OVERLAY,
  mode: 'select',
  selection: ['sofa'],
  gizmo: { mode: 'move', space: 'local', centre: { x: 0, y: 0, height: 0 }, axes: [], turn: 30 },
};

interface Touch {
  readonly id?: number;
  readonly button?: number;
  readonly mouse?: boolean;
  readonly shift?: boolean;
  readonly alt?: boolean;
}

function sample(x: number, y: number, touch: Touch = {}): PointerSample {
  return {
    id: touch.id ?? 1,
    x,
    y,
    button: touch.button ?? 0,
    mouse: touch.mouse ?? false,
    shift: touch.shift ?? false,
    alt: touch.alt ?? false,
  };
}

function hitAt(at: Point): EditHit {
  return (
    REGIONS.find((region) => at.x >= region.left && at.x < region.right)?.hit ?? { kind: 'none' }
  );
}

interface Session {
  readonly start: DragStart;
  readonly move: ReturnType<typeof vi.fn<(at: Point, modifiers: Modifiers) => void>>;
  readonly twist: ReturnType<
    typeof vi.fn<(motion: PinchTwist, modifiers: Modifiers, pair: readonly [Point, Point]) => void>
  >;
  readonly cancel: ReturnType<typeof vi.fn<() => void>>;
}

interface Timer {
  readonly fire: () => void;
  readonly ms: number;
  live: boolean;
}

interface Rig {
  readonly pointer: EditPointer;
  readonly events: readonly EditEvent[];
  readonly hovers: readonly (PointerHover | null)[];
  readonly sessions: readonly Session[];
  readonly timers: readonly Timer[];
  readonly holdLong: () => void;
}

function idOf(hit: EditHit): string | null {
  return hit.kind === 'none' ? null : hit.id;
}

function pressAt(at: Point, bodyId: string | null): PressPick {
  const pick = hitAt(at);
  return { pick, onBody: bodyId !== null && idOf(pick) === bodyId };
}

function groundAt(at: Point): GroundTap | null {
  if (at.y < 0) return null;
  return { point: { x: at.x / 100, y: at.y / 100 }, floorId: 'ground', metresPerPx: 0.01 };
}

function placeAt(at: Point): PlaceSpot | null {
  if (at.y < 0) return null;
  const offset = at.x / 100;
  return {
    at: { x: offset, y: 6 },
    height: 1.8,
    rotation: 270,
    surface: { kind: 'wall', wallId: 'north' },
    wall: { wallId: HOME_MAP_WALL_ID.parse('north'), offset, side: 'right' },
  };
}

function paintAt(at: Point): EditPaintTarget | null {
  if (at.x >= KITCHEN.left && at.x < KITCHEN.right) return { kind: 'floor', roomId: 'kitchen' };
  return at.x >= 900 ? { kind: 'wall', wallId: 'north', side: 'left' } : null;
}

function rig(overlay: EditOverlay = SELECTED, handles: readonly HandleCentre[] = []): Rig {
  const events: EditEvent[] = [];
  const hovers: (PointerHover | null)[] = [];
  const sessions: Session[] = [];
  const timers: Timer[] = [];
  const pointer = new EditPointer(overlay, {
    scene: {
      pressAt,
      handleCentres: (): readonly HandleCentre[] => handles,
      groundAt,
      stagePoint: (at): Point => ({ x: at.x - STAGE_LEFT, y: at.y }),
      isRoom: (id): boolean => id === 'kitchen',
      paintAt,
      placeAt,
    },
    emit: (event): void => {
      events.push(event);
    },
    hover: (hover): void => {
      hovers.push(hover);
    },
    startDrag: (start): DragSession => {
      const session: Session = { start, move: vi.fn(), twist: vi.fn(), cancel: vi.fn() };
      sessions.push(session);
      return {
        move: session.move,
        twist: session.twist,
        cancel: session.cancel,
        end: (): EditEventDraft => ({ type: 'rotate', id: 'sofa', degrees: 45 }),
      };
    },
    timer: (ms, fire): (() => void) => {
      const timer: Timer = { fire, ms, live: true };
      timers.push(timer);
      return (): void => {
        timer.live = false;
      };
    },
  });
  const holdLong = (): void => {
    for (const timer of timers.filter((item) => item.live)) {
      expect(timer.ms).toBe(GESTURE_HANDLER_LONG_PRESS_MS);
      timer.live = false;
      timer.fire();
    }
  };
  return { pointer, events, hovers, sessions, holdLong, timers };
}

function drag(pointer: EditPointer, from: number, to: number, touch: Touch = {}): string[] {
  const routes: string[] = [];
  pointer.down(sample(from, 50, touch));
  for (let x = from + 4; x <= to; x += 4) routes.push(pointer.move(sample(x, 50, touch)));
  pointer.up(sample(to, 50, touch));
  return routes;
}

describe('press arbitration while editing', () => {
  it('taps empty ground with the ground point, the hit and the scale there', () => {
    const { pointer, events } = rig();
    pointer.down(sample(40, 50));
    pointer.up(sample(42, 51));
    expect(events).toEqual([
      {
        seq: 0,
        type: 'tap',
        point: { x: 0.42, y: 0.51 },
        floorId: 'ground',
        hit: { kind: 'none' },
        metresPerPx: 0.01,
      },
    ]);
  });

  it('selects an unselected item with a tap and numbers events in order', () => {
    const { pointer, events } = rig();
    pointer.down(sample(550, 50));
    pointer.up(sample(550, 50));
    pointer.down(sample(150, 50));
    pointer.up(sample(150, 50));
    expect(events.map((event) => [event.seq, event.type === 'tap' ? event.hit : null])).toEqual([
      [0, { kind: 'device', id: 'lamp' }],
      [1, { kind: 'object', id: 'sofa', locked: false }],
    ]);
  });

  it('leaves a drag on empty space or an unselected item to the camera and emits nothing', () => {
    const { pointer, events, sessions } = rig();
    expect(drag(pointer, 20, 80).every((route) => route === 'camera')).toBe(true);
    expect(drag(pointer, 520, 590).every((route) => route === 'camera')).toBe(true);
    expect(events).toEqual([]);
    expect(sessions).toEqual([]);
  });

  it('moves the selected body only once the press travels past the slop', () => {
    const { pointer, events, sessions } = rig();
    pointer.down(sample(120, 50));
    expect(pointer.move(sample(120 + TAP_SLOP_PIXELS, 50))).toBe('claimed');
    expect(sessions).toEqual([]);
    expect(pointer.move(sample(130 + TAP_SLOP_PIXELS, 50, { shift: true }))).toBe('claimed');
    const [session] = sessions;
    expect(session?.start.grab).toEqual({ kind: 'body', id: 'sofa' });
    expect(session?.start.from).toEqual({ x: 120, y: 50 });
    expect(session?.move).toHaveBeenLastCalledWith(
      { x: 130 + TAP_SLOP_PIXELS, y: 50 },
      { shift: true, alt: false, free: false },
    );
    pointer.up(sample(130 + TAP_SLOP_PIXELS, 50));
    expect(events).toEqual([{ seq: 0, type: 'rotate', id: 'sofa', degrees: 45 }]);
  });

  it('taps the selected body when it is released within the slop', () => {
    const { pointer, events, sessions } = rig();
    pointer.down(sample(150, 50));
    pointer.move(sample(153, 50));
    pointer.up(sample(153, 50));
    expect(sessions).toEqual([]);
    expect(events.map((event) => event.type)).toEqual(['tap']);
  });

  it('gives a press on a locked selected item to the camera', () => {
    const { pointer, sessions } = rig({ ...SELECTED, selection: ['safe'] });
    expect(drag(pointer, 320, 380).every((route) => route === 'camera')).toBe(true);
    expect(sessions).toEqual([]);
  });

  it('never drags a selected room by its body, so one finger still orbits over it', () => {
    const { pointer, sessions } = rig({ ...SELECTED, selection: ['kitchen'] });
    expect(drag(pointer, 720, 780).every((route) => route === 'camera')).toBe(true);
    expect(sessions).toEqual([]);
  });

  it('lets a handle win over the body under it and over the camera', () => {
    const handles = [{ id: 'corner-ne', x: 150, y: 50 }];
    const { pointer, events, sessions } = rig(SELECTED, handles);
    expect(drag(pointer, 150, 190).every((route) => route === 'claimed')).toBe(true);
    expect(sessions.map((session) => session.start.grab)).toEqual([
      { kind: 'handle', handleId: 'corner-ne' },
    ]);
    expect(events.map((event) => event.type)).toEqual(['rotate']);
    const empty = rig(SELECTED, [{ id: 'end', x: 40, y: 50 }]);
    expect(drag(empty.pointer, 40, 80).every((route) => route === 'claimed')).toBe(true);
  });

  it('picks up an unselected item on a long press and moves it from there', () => {
    const { pointer, events, sessions, holdLong } = rig();
    pointer.down(sample(550, 50));
    holdLong();
    expect(events).toEqual([{ seq: 0, type: 'pick-up', id: 'lamp' }]);
    expect(pointer.move(sample(560 + TAP_SLOP_PIXELS, 50))).toBe('claimed');
    expect(sessions.map((session) => session.start.grab)).toEqual([{ kind: 'body', id: 'lamp' }]);
    pointer.up(sample(560 + TAP_SLOP_PIXELS, 50));
    expect(events.map((event) => event.type)).toEqual(['pick-up', 'rotate']);
  });

  it('opens the menu when a long press is released without moving', () => {
    const { pointer, events, holdLong } = rig();
    pointer.down(sample(550, 50));
    holdLong();
    pointer.up(sample(550, 50));
    expect(events).toEqual([
      { seq: 0, type: 'pick-up', id: 'lamp' },
      {
        seq: 1,
        type: 'menu',
        point: { x: 550 - STAGE_LEFT, y: 50 },
        pick: { kind: 'device', id: 'lamp' },
      },
    ]);
  });

  it('picks up the selected body on a long press too', () => {
    const { pointer, events, holdLong } = rig();
    pointer.down(sample(150, 50));
    holdLong();
    pointer.up(sample(150, 50));
    expect(events.map((event) => event.type)).toEqual(['pick-up', 'menu']);
  });

  it('opens the menu without picking up a locked item or a room on a long press', () => {
    const { pointer, events, holdLong } = rig();
    pointer.down(sample(350, 50));
    holdLong();
    pointer.up(sample(350, 50));
    pointer.down(sample(750, 50));
    holdLong();
    pointer.up(sample(750, 50));
    expect(events.map((event) => (event.type === 'menu' ? event.pick : event.type))).toEqual([
      { kind: 'object', id: 'safe', locked: true },
      { kind: 'room', id: 'kitchen' },
    ]);
  });

  it('cancels the long press once the press travels past the slop', () => {
    const { pointer, events, timers } = rig();
    pointer.down(sample(550, 50));
    pointer.move(sample(552 + TAP_SLOP_PIXELS, 50));
    expect(timers.every((timer) => !timer.live)).toBe(true);
    pointer.up(sample(552 + TAP_SLOP_PIXELS, 50));
    expect(events).toEqual([]);
  });

  it('arms no long press on empty ground', () => {
    const { pointer, timers } = rig();
    pointer.down(sample(40, 50));
    expect(timers).toEqual([]);
  });
});

describe('mouse buttons while editing', () => {
  it('opens the menu on a right release within the slop at the stage point', () => {
    const { pointer, events } = rig();
    pointer.down(sample(150, 50, { mouse: true, button: 2 }));
    expect(pointer.move(sample(153, 52, { mouse: true, button: -1 }))).toBe('camera');
    pointer.up(sample(153, 52, { mouse: true, button: 2 }));
    expect(events).toEqual([
      { seq: 0, type: 'menu', point: { x: 153 - STAGE_LEFT, y: 52 }, pick: SOFA.hit },
    ]);
  });

  it('orbits on a right drag past the slop without a menu, even over the selected body', () => {
    const { pointer, events, sessions } = rig();
    const routes = drag(pointer, 120, 180, { mouse: true, button: 2 });
    expect(routes.every((route) => route === 'camera')).toBe(true);
    expect(events).toEqual([]);
    expect(sessions).toEqual([]);
  });

  it('pans on a left drag over empty space and drags the selected body with the left button', () => {
    const { pointer, sessions } = rig();
    expect(drag(pointer, 20, 80, { mouse: true }).every((route) => route === 'camera')).toBe(true);
    expect(drag(pointer, 120, 180, { mouse: true }).every((route) => route === 'claimed')).toBe(
      true,
    );
    expect(sessions).toHaveLength(1);
  });

  it('does nothing on a middle click', () => {
    const { pointer, events } = rig();
    pointer.down(sample(150, 50, { mouse: true, button: 1 }));
    pointer.up(sample(150, 50, { mouse: true, button: 1 }));
    expect(events).toEqual([]);
  });

  it('turns the selected unlocked item one step on Alt+wheel and zooms otherwise', () => {
    const { pointer, events } = rig();
    expect(pointer.wheel(120, { x: 150, y: 50 }, true)).toBe('claimed');
    expect(pointer.wheel(-120, { x: 150, y: 50 }, true)).toBe('claimed');
    expect(pointer.wheel(120, { x: 150, y: 50 }, false)).toBe('camera');
    expect(pointer.wheel(120, { x: 550, y: 50 }, true)).toBe('camera');
    expect(pointer.wheel(0, { x: 150, y: 50 }, true)).toBe('camera');
    expect(events).toEqual([
      { seq: 0, type: 'rotate', id: 'sofa', degrees: 45 },
      { seq: 1, type: 'rotate', id: 'sofa', degrees: 15 },
    ]);
  });

  it('zooms on Alt+wheel over a locked selection or without a gizmo', () => {
    expect(rig({ ...SELECTED, selection: ['safe'] }).pointer.wheel(1, { x: 350, y: 0 }, true)).toBe(
      'camera',
    );
    expect(rig({ ...SELECTED, gizmo: null }).pointer.wheel(1, { x: 150, y: 0 }, true)).toBe(
      'camera',
    );
  });
});

describe('second finger while editing', () => {
  it('twists and scales the held body with the second finger', () => {
    const { pointer, sessions } = rig();
    pointer.down(sample(150, 50));
    pointer.down(sample(250, 50, { id: 2 }));
    expect(sessions).toHaveLength(1);
    expect(pointer.move(sample(150, 250, { id: 2 }))).toBe('claimed');
    const twist = sessions[0]?.twist.mock.lastCall;
    expect(twist?.[0].scale).toBeCloseTo(2);
    expect(twist?.[0].twistDeg).toBeCloseTo(90);
    expect(twist?.[1]).toEqual({ shift: false, alt: false, free: true });
    expect(twist?.[2]).toEqual([
      { x: 150, y: 50 },
      { x: 150, y: 250 },
    ]);
    expect(sessions[0]?.move).not.toHaveBeenCalled();
  });

  it('keeps a handle drag going and ignores the second finger', () => {
    const { pointer, sessions } = rig(SELECTED, [{ id: 'side', x: 150, y: 50 }]);
    pointer.down(sample(150, 50));
    pointer.move(sample(160 + TAP_SLOP_PIXELS, 50));
    pointer.down(sample(300, 50, { id: 2 }));
    expect(pointer.move(sample(340, 90, { id: 2 }))).toBe('claimed');
    pointer.move(sample(170 + TAP_SLOP_PIXELS, 50));
    expect(sessions[0]?.twist).not.toHaveBeenCalled();
    expect(sessions[0]?.move).toHaveBeenLastCalledWith(
      { x: 170 + TAP_SLOP_PIXELS, y: 50 },
      { shift: false, alt: false, free: false },
    );
  });

  it('leaves two fingers on empty space to the camera and never taps afterwards', () => {
    const { pointer, events } = rig();
    pointer.down(sample(20, 50));
    pointer.down(sample(60, 50, { id: 2 }));
    expect(pointer.move(sample(80, 50, { id: 2 }))).toBe('camera');
    pointer.up(sample(80, 50, { id: 2 }));
    pointer.up(sample(20, 50));
    expect(events).toEqual([]);
  });
});

describe('tools that draw', () => {
  it.each(['draw-rect', 'draw-points'] as const)(
    'uses taps only in %s, so drags over the selection stay camera',
    (mode) => {
      const { pointer, events, timers } = rig({ ...SELECTED, mode });
      expect(drag(pointer, 120, 180).every((route) => route === 'camera')).toBe(true);
      pointer.down(sample(550, 50));
      expect(timers).toEqual([]);
      pointer.up(sample(550, 50));
      expect(events.map((event) => event.type)).toEqual(['tap']);
    },
  );

  it('still lets a placed corner handle be dragged while drawing', () => {
    const { pointer, sessions } = rig({ ...SELECTED, mode: 'draw-points' }, [
      { id: 'p0', x: 40, y: 50 },
    ]);
    expect(drag(pointer, 40, 80).every((route) => route === 'claimed')).toBe(true);
    expect(sessions.map((session) => session.start.grab)).toEqual([
      { kind: 'handle', handleId: 'p0' },
    ]);
  });

  it('claims nothing when read only but still taps', () => {
    const handles = [{ id: 'corner', x: 150, y: 50 }];
    const { pointer, events, sessions } = rig({ ...SELECTED, readOnly: true }, handles);
    expect(drag(pointer, 150, 190).every((route) => route === 'camera')).toBe(true);
    pointer.down(sample(150, 50));
    pointer.up(sample(150, 50));
    expect(sessions).toEqual([]);
    expect(pointer.wheel(1, { x: 150, y: 50 }, true)).toBe('camera');
    expect(events.map((event) => event.type)).toEqual(['tap']);
  });
});

describe('cancelled pointers', () => {
  it('cancels a running drag and tells the app', () => {
    const { pointer, events, sessions } = rig();
    pointer.down(sample(120, 50));
    pointer.move(sample(140, 50));
    pointer.cancel(sample(140, 50));
    expect(sessions[0]?.cancel).toHaveBeenCalledOnce();
    expect(events).toEqual([{ seq: 0, type: 'cancel' }]);
  });

  it('cancels a pick-up that has not moved yet', () => {
    const { pointer, events, holdLong } = rig();
    pointer.down(sample(550, 50));
    holdLong();
    pointer.cancel(sample(550, 50));
    expect(events.map((event) => event.type)).toEqual(['pick-up', 'cancel']);
  });

  it('neither taps nor arms a long press after a cancelled press', () => {
    const { pointer, events, timers } = rig();
    pointer.down(sample(550, 50));
    pointer.cancel(sample(550, 50));
    pointer.up(sample(550, 50));
    expect(timers.every((timer) => !timer.live)).toBe(true);
    expect(events).toEqual([]);
  });

  it('drops a running drag without an event when editing stops', () => {
    const { pointer, events, sessions } = rig();
    pointer.down(sample(120, 50));
    pointer.move(sample(140, 50));
    pointer.dispose();
    expect(sessions[0]?.cancel).toHaveBeenCalledOnce();
    expect(events).toEqual([]);
  });
});

describe('rooms in the Rooms tool', () => {
  const ROOM_TOOL: EditOverlay = { ...SELECTED, selection: ['kitchen'], roomDrag: true };

  it('drags the selected room by its body when the overlay allows it', () => {
    const { pointer, sessions, timers } = rig(ROOM_TOOL);
    expect(drag(pointer, 720, 780).every((route) => route === 'claimed')).toBe(true);
    expect(sessions.map((session) => session.start.grab)).toEqual([
      { kind: 'body', id: 'kitchen' },
    ]);
    expect(timers.every((timer) => !timer.live)).toBe(true);
  });

  it('opens the menu on a long press release of the selected room without picking it up', () => {
    const { pointer, events, sessions, holdLong } = rig(ROOM_TOOL);
    pointer.down(sample(750, 50));
    holdLong();
    pointer.up(sample(750, 50));
    expect(sessions).toEqual([]);
    expect(events).toEqual([
      {
        seq: 0,
        type: 'menu',
        point: { x: 750 - STAGE_LEFT, y: 50 },
        pick: { kind: 'room', id: 'kitchen' },
      },
    ]);
  });

  it('never turns a room on Alt+wheel', () => {
    const { pointer, events } = rig(ROOM_TOOL);
    expect(pointer.wheel(1, { x: 750, y: 50 }, true)).toBe('camera');
    expect(events).toEqual([]);
  });
});

describe('placing and painting', () => {
  const PLACE: EditOverlay = {
    ...NO_EDIT_OVERLAY,
    mode: 'place',
    place: { kind: 'device', mount: 'wall', height: 1.8 },
  };
  const PAINT: EditOverlay = { ...NO_EDIT_OVERLAY, mode: 'paint', paint: { surface: 'floor' } };

  it('reports the landing spot of the armed item on a tap and keeps drags for the camera', () => {
    const { pointer, events } = rig(PLACE);
    expect(drag(pointer, 120, 180).every((route) => route === 'camera')).toBe(true);
    pointer.down(sample(250, 50));
    pointer.up(sample(250, 50));
    expect(events.map((event) => event.type)).toEqual(['place']);
    expect(events[0]).toEqual({
      seq: 0,
      type: 'place',
      at: { x: 2.5, y: 6 },
      height: 1.8,
      rotation: 270,
      surface: { kind: 'wall', wallId: 'north' },
      wall: { wallId: 'north', offset: 2.5, side: 'right' },
    });
  });

  it('reports the painted surface on a tap and nothing where no surface is', () => {
    const { pointer, events } = rig(PAINT);
    pointer.down(sample(750, 50));
    pointer.up(sample(750, 50));
    pointer.down(sample(50, 50));
    pointer.up(sample(50, 50));
    expect(events).toEqual([
      { seq: 0, type: 'paint', target: { kind: 'floor', roomId: 'kitchen' } },
    ]);
  });

  it('places and paints nothing when read only', () => {
    for (const overlay of [PLACE, PAINT]) {
      const { pointer, events } = rig({ ...overlay, readOnly: true });
      pointer.down(sample(750, 50));
      pointer.up(sample(750, 50));
      expect(events).toEqual([]);
    }
  });

  it('follows the mouse with the surface under it, once per change, and clears on press and leave', () => {
    const { pointer, hovers } = rig(PAINT);
    const mouse = { mouse: true };
    pointer.hover(sample(720, 50, mouse));
    pointer.hover(sample(760, 50, mouse));
    pointer.hover(sample(50, 50, mouse));
    pointer.hover(sample(750, 50, mouse));
    pointer.down(sample(750, 50, mouse));
    pointer.hover(sample(750, 50, mouse));
    pointer.up(sample(750, 50, mouse));
    pointer.hover(sample(750, 50, mouse));
    pointer.hover(null);
    const floor = { kind: 'paint', target: { kind: 'floor', roomId: 'kitchen' } };
    expect(hovers).toEqual([floor, null, floor, null, floor, null]);
  });

  it('shows the landing spot under the mouse and drops it when the tool stops placing', () => {
    const { pointer, hovers } = rig(PLACE);
    pointer.hover(sample(250, 50, { mouse: true }));
    pointer.setOverlay(SELECTED);
    expect(hovers).toEqual([{ kind: 'place', spot: placeAt({ x: 250, y: 50 }) }, null]);
  });

  it('names the handle under the resting mouse and drops it on press, leave and read only', () => {
    const centres = [{ id: 'gizmo:axis-x', x: 150, y: 50 }];
    const { pointer, hovers } = rig(SELECTED, centres);
    const mouse = { mouse: true };
    pointer.hover(sample(160, 50, mouse));
    pointer.hover(sample(165, 50, mouse));
    pointer.hover(sample(150 + HANDLE_TARGET_PX.mouse, 50, mouse));
    pointer.hover(sample(150, 50, mouse));
    pointer.down(sample(150, 50, mouse));
    pointer.up(sample(150, 50, mouse));
    pointer.hover(sample(150, 50, mouse));
    pointer.setOverlay({ ...SELECTED, readOnly: true });
    const handle = { kind: 'handle', handleId: 'gizmo:axis-x' };
    expect(hovers).toEqual([handle, null, handle, null, handle, null]);
  });

  it('prefers a handle over the painted surface and re-reads the spot when the overlay changes', () => {
    const { pointer, hovers } = rig(PAINT, [{ id: 'corner', x: 750, y: 50 }]);
    pointer.hover(sample(750, 50, { mouse: true }));
    pointer.setOverlay(PLACE);
    expect(hovers).toEqual([{ kind: 'handle', handleId: 'corner' }]);
    const placing = rig(PAINT);
    placing.pointer.hover(sample(750, 50, { mouse: true }));
    placing.pointer.setOverlay(PLACE);
    expect(placing.hovers).toEqual([
      { kind: 'paint', target: { kind: 'floor', roomId: 'kitchen' } },
      { kind: 'place', spot: placeAt({ x: 750, y: 50 }) },
    ]);
  });

  it('ignores touch hover and hover outside the place and paint modes', () => {
    const { pointer, hovers } = rig(PAINT);
    pointer.hover(sample(750, 50));
    const selecting = rig(SELECTED);
    selecting.pointer.hover(sample(750, 50, { mouse: true }));
    expect([...hovers, ...selecting.hovers]).toEqual([]);
  });
});

describe('landing spots', () => {
  const view = gizmoView({ id: 'sofa', mode: 'move' });
  const at = (world: Vec3): Point => screenOf(view, world);

  it('seats a wall device on the nearest wall face at its height', () => {
    const spot = placeSpotAt(
      view,
      { kind: 'device', mount: 'wall', height: 1.8 },
      at(ground(3, 5.9)),
    );
    expect(spot?.surface).toEqual({ kind: 'wall', wallId: 'north' });
    expect(spot?.wall?.wallId).toBe('north');
    expect(spot?.wall?.offset).toBeCloseTo(3, 6);
    expect(spot?.height).toBe(1.8);
    expect(spot?.at.y).toBeCloseTo(5.95, 6);
  });

  it('keeps a wall device off the wall when the pointer is far from every wall', () => {
    expect(
      placeSpotAt(view, { kind: 'device', mount: 'wall', height: 1.8 }, at(ground(5, 3))),
    ).toBeNull();
  });

  it('lifts a ceiling device to the ceiling and puts a table device on the table top', () => {
    const ceiling = placeSpotAt(
      view,
      { kind: 'device', mount: 'ceiling', height: 0 },
      at(ground(2, 2)),
    );
    expect(ceiling?.surface).toEqual({ kind: 'ceiling' });
    expect(ceiling?.height).toBe(2.6);
    expect(ceiling?.at.x).toBeCloseTo(2, 6);
    const table = placeSpotAt(
      view,
      { kind: 'device', mount: 'table', height: 0 },
      at(ground(5.8, 3, 0.75)),
    );
    expect(table?.surface).toEqual({ kind: 'table', objectId: 'table' });
    expect(table?.height).toBeCloseTo(0.75, 9);
    expect(table?.at.x).toBeCloseTo(5.8, 6);
    const floor = placeSpotAt(
      view,
      { kind: 'device', mount: 'table', height: 0 },
      at(ground(8, 1)),
    );
    expect(floor?.surface).toEqual({ kind: 'ground' });
  });

  it('lands a piece of furniture on the floor with its armed turn', () => {
    const spot = placeSpotAt(
      view,
      { kind: 'object', footprint: { w: 1, d: 2 }, rotation: 90 },
      at(ground(7, 2)),
    );
    expect(spot?.rotation).toBe(90);
    expect(spot?.height).toBe(0);
    expect(spot?.at.x).toBeCloseTo(7, 6);
    expect(spot?.at.y).toBeCloseTo(2, 6);
  });
});

describe('handle hit test', () => {
  const centres = [
    { id: 'far', x: 20, y: 0 },
    { id: 'near', x: 10, y: 0 },
  ];

  it('takes the nearest projected handle centre within the target radius', () => {
    expect(handleAt(centres, { x: 0, y: 0 }, false)).toBe('near');
    expect(handleAt(centres, { x: 10 + HANDLE_TARGET_PX.touch / 2 + 1, y: 0 }, false)).toBe('far');
    expect(handleAt(centres, { x: 0, y: 100 }, false)).toBeNull();
  });

  it('uses the smaller mouse target on desktop', () => {
    const at = { x: 10 + HANDLE_TARGET_PX.mouse / 2 + 1, y: 0 };
    expect(handleAt([{ id: 'near', x: 10, y: 0 }], at, true)).toBeNull();
    expect(handleAt([{ id: 'near', x: 10, y: 0 }], at, false)).toBe('near');
  });
});

describe('the gesture tracker with a claim', () => {
  function tracked(): {
    readonly tracker: GestureTracker;
    readonly handlers: Record<'orbit' | 'panZoom' | 'tap' | 'menu', ReturnType<typeof vi.fn>>;
    readonly editing: Rig;
  } {
    const handlers = { orbit: vi.fn(), panZoom: vi.fn(), tap: vi.fn(), menu: vi.fn() };
    const tracker = new GestureTracker(handlers);
    const editing = rig();
    tracker.setClaim(editing.pointer);
    return { tracker, handlers, editing };
  }

  function run(tracker: GestureTracker, from: number, to: number, touch: Touch = {}): void {
    tracker.down(sample(from, 50, touch));
    for (let x = from + 4; x <= to; x += 4) tracker.move(sample(x, 50, touch));
    tracker.up(sample(to, 50, touch));
  }

  it('orbits for presses the claim leaves to the camera and holds still for claimed ones', () => {
    const { tracker, handlers, editing } = tracked();
    run(tracker, 20, 80);
    expect(handlers.orbit).toHaveBeenCalled();
    handlers.orbit.mockClear();
    run(tracker, 120, 180);
    expect(handlers.orbit).not.toHaveBeenCalled();
    expect(editing.sessions).toHaveLength(1);
  });

  it('sends taps and right releases to the claim instead of the viewer handlers', () => {
    const { tracker, handlers, editing } = tracked();
    run(tracker, 40, 40);
    run(tracker, 150, 150, { mouse: true, button: 2 });
    expect(handlers.tap).not.toHaveBeenCalled();
    expect(handlers.menu).not.toHaveBeenCalled();
    expect(editing.events.map((event) => event.type)).toEqual(['tap', 'menu']);
  });

  it('pans and pinches with two fingers on empty space while editing', () => {
    const { tracker, handlers } = tracked();
    tracker.down(sample(20, 50));
    tracker.down(sample(60, 50, { id: 2 }));
    tracker.move(sample(100, 50, { id: 2 }));
    expect(handlers.panZoom).toHaveBeenCalled();
  });

  it('behaves exactly as the viewer once the claim is removed', () => {
    const { tracker, handlers, editing } = tracked();
    tracker.setClaim(null);
    run(tracker, 150, 150);
    run(tracker, 120, 180);
    run(tracker, 150, 150, { mouse: true, button: 2 });
    expect(handlers.tap).toHaveBeenCalledExactlyOnceWith(150, 50);
    expect(handlers.orbit).toHaveBeenCalled();
    expect(handlers.menu).toHaveBeenCalledExactlyOnceWith(150, 50);
    expect(editing.events).toEqual([]);
  });

  it('never taps the viewer for a gesture that was running when editing stopped', () => {
    const { tracker, handlers } = tracked();
    tracker.down(sample(40, 50));
    tracker.setClaim(null);
    tracker.up(sample(40, 50));
    expect(handlers.tap).not.toHaveBeenCalled();
  });
});

describe('scene editing lifecycle', () => {
  const unused = (): never => {
    throw new Error('not read while idle');
  };
  const source = (hooks: EditSource['hooks']): EditSource => ({
    hooks,
    camera: unused,
    bounds: unused,
    viewport: unused,
    targets: unused,
    look: unused,
    items: unused,
    gizmoCentres: unused,
  });
  const edit = (overlay: EditOverlay): SceneEdit => ({
    overlay,
    floor: GROUND,
    edit: EDIT,
  });
  const hooks = { onEdit: vi.fn(), onHover: vi.fn(), startDrag: vi.fn() };
  const GROUND: RenderFloor = {
    id: 'ground',
    name: 'Ground',
    level: 0,
    elevation: 0,
    ceilingHeight: 2.5,
    bounds: null,
    rooms: [],
    walls: [],
    openings: [],
    objects: [],
    placements: [],
    carpets: [],
    markers: [],
    measures: [],
    vacuum: null,
  };

  it('refuses to edit a map created without edit hooks', () => {
    expect(() => SceneEditing.next(null, edit(SELECTED), () => source(undefined))).toThrow(
      EditingUnavailableError,
    );
  });

  it('keeps one pointer across overlay updates and drops it when editing stops', () => {
    const first = SceneEditing.next(null, edit(SELECTED), () => source(hooks));
    const second = SceneEditing.next(first, edit(NO_EDIT_OVERLAY), unused);
    expect(second).toBe(first);
    expect(SceneEditing.next(second, null, unused)).toBeNull();
    expect(SceneEditing.next(null, null, unused)).toBeNull();
  });
});
