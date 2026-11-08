import { describe, expect, it } from 'vitest';
import { HOME_MAP_PLACEMENT_WRITE, type HomeMapFloor } from '@smarteverything/domain';
import type { EditEvent } from '../../../../components/house-map/3d/map-3d-edit-protocol';
import { GIZMO_START, type GizmoState } from '../tool-state';
import { BIG, FLOOR_ID, SOFA_ID, floorWith, sofa, specOf } from '../tools/furniture-fixture';
import {
  LOCK_BADGE_TEXT,
  ROOM_SCALE_NOTICE,
  gizmoEditOps,
  gizmoModes,
  handlesOverlay,
  isGizmoEdit,
  lockedNotice,
  type GizmoEdit,
} from './handles-overlay';
import { commandOutcome, objectActions, runAction, type ActionTarget } from './object-actions';
import { selectionTarget } from './pick';

const DEVICE_ID = '00000000-0000-4000-8000-0000000000d1';

function lampAt(mount: 'floor' | 'wall' | 'ceiling'): HomeMapFloor['placements'][number] {
  return HOME_MAP_PLACEMENT_WRITE.parse({
    deviceId: DEVICE_ID,
    floorId: FLOOR_ID,
    at: { x: 2, y: 2 },
    rotation: 30,
    height: mount === 'floor' ? 0 : 1.8,
    tilt: 0,
    mount,
    auto: true,
    camera: null,
  });
}

function floorWithLamp(
  mount: 'floor' | 'wall' | 'ceiling' = 'floor',
  locked = false,
): HomeMapFloor {
  return { ...floorWith([sofa(locked)]), placements: [lampAt(mount)] };
}

function roomTarget(floor: HomeMapFloor): ActionTarget {
  const target = selectionTarget(floor, BIG);
  if (target?.kind !== 'room') throw new Error('no room target');
  return target;
}

function targetOf(floor: HomeMapFloor, id: string): ActionTarget | null {
  return selectionTarget(floor, id);
}

function overlayOf(
  floor: HomeMapFloor,
  selectedId: string | null,
  gizmo: Partial<GizmoState> = {},
  readOnly = false,
): ReturnType<typeof handlesOverlay> {
  return handlesOverlay({
    floor,
    selectedId,
    readOnly,
    gizmo: { ...GIZMO_START, owner: selectedId, ...gizmo },
    specOf,
    nameOf: (): string => 'Sofa',
  });
}

function edit<E extends GizmoEdit>(event: E): E {
  return event;
}

describe('selectionTarget', () => {
  it('finds objects, devices and rooms by id', () => {
    const floor = floorWithLamp();
    expect(selectionTarget(floor, SOFA_ID)?.kind).toBe('object');
    expect(selectionTarget(floor, DEVICE_ID)?.kind).toBe('device');
    expect(selectionTarget(floor, BIG)?.kind).toBe('room');
    expect(selectionTarget(floor, 'gone')).toBeNull();
    expect(selectionTarget(floor, null)).toBeNull();
  });
});

describe('gizmo modes', () => {
  it('offers every mode on furniture, Move and Rotate on a device, Move and Scale on a room', () => {
    const floor = floorWithLamp();
    expect(gizmoModes(targetOf(floor, SOFA_ID))).toEqual(['move', 'rotate', 'scale']);
    expect(gizmoModes(targetOf(floor, DEVICE_ID))).toEqual(['move', 'rotate']);
    expect(gizmoModes(targetOf(floor, BIG))).toEqual(['move', 'scale']);
  });

  it('gives a wall device Move only and a locked item no mode at all', () => {
    expect(gizmoModes(targetOf(floorWithLamp('wall'), DEVICE_ID))).toEqual(['move']);
    expect(gizmoModes(targetOf(floorWithLamp('floor', true), SOFA_ID))).toEqual([]);
    expect(gizmoModes(null)).toEqual([]);
  });
});

describe('handles overlay', () => {
  it('puts the gizmo of the current mode on the selected furniture with its turn', () => {
    const { overlay, notice } = overlayOf(floorWithLamp(), SOFA_ID, { mode: 'rotate' });
    expect(overlay.mode).toBe('select');
    expect(overlay.selection).toEqual([SOFA_ID]);
    expect(overlay.gizmo).toEqual({
      mode: 'rotate',
      space: 'local',
      centre: { x: 2, y: 2, height: 0 },
      axes: ['x', 'y', 'z'],
      turn: 0,
    });
    expect(overlay.snapping).toBe(true);
    expect(notice).toBeNull();
  });

  it('sends the world axes and the snapping switch to the scene', () => {
    const { overlay } = overlayOf(floorWithLamp(), SOFA_ID, { space: 'world', snapping: false });
    expect(overlay.gizmo?.space).toBe('world');
    expect(overlay.snapping).toBe(false);
  });

  it('moves a wall device along the wall and up, and a ceiling device on its plane', () => {
    const wall = overlayOf(floorWithLamp('wall'), DEVICE_ID).overlay.gizmo;
    expect(wall?.axes).toEqual(['x', 'z']);
    expect(wall?.centre).toEqual({ x: 2, y: 2, height: 1.8 });
    expect(wall?.turn).toBe(30);
    expect(overlayOf(floorWithLamp('ceiling'), DEVICE_ID).overlay.gizmo?.axes).toEqual(['x', 'y']);
  });

  it('centres a room gizmo on the room and explains Scale in the notice chip', () => {
    const move = overlayOf(floorWithLamp(), BIG);
    expect(move.overlay.gizmo?.centre).toEqual({ x: 2.5, y: 2.5, height: 0 });
    expect(move.overlay.gizmo?.axes).toEqual(['x', 'y']);
    expect(move.notice).toBeNull();
    const scale = overlayOf(floorWithLamp(), BIG, { mode: 'scale' });
    expect(scale.notice).toEqual({ text: ROOM_SCALE_NOTICE, tone: 'info' });
  });

  it('gives a locked item no gizmo, an outline, a lock badge and the unlock notice', () => {
    const { overlay, notice } = overlayOf(floorWithLamp('floor', true), SOFA_ID);
    expect(overlay.gizmo).toBeNull();
    expect(overlay.selection).toEqual([SOFA_ID]);
    const [outline] = overlay.ghosts;
    expect(outline?.shape).toBe('polyline');
    if (outline?.shape !== 'polyline') throw new Error('no outline');
    expect(outline.points).toHaveLength(5);
    expect(outline.points[0]).toEqual(outline.points[4]);
    expect(overlay.labels.map((label) => label.text)).toEqual([LOCK_BADGE_TEXT]);
    expect(notice).toEqual({ text: lockedNotice('Sofa'), tone: 'info' });
    expect(lockedNotice('Sofa')).toBe('Sofa is locked. Unlock to move it.');
  });

  it('draws no gizmo while read only and nothing for no selection', () => {
    expect(overlayOf(floorWithLamp(), SOFA_ID, {}, true).overlay.gizmo).toBeNull();
    const empty = overlayOf(floorWithLamp(), null).overlay;
    expect(empty.selection).toEqual([]);
    expect(empty.gizmo).toBeNull();
  });
});

describe('gizmo edits', () => {
  it('turns a ring or Alt+wheel turn into one rotation update, manual for a device', () => {
    const floor = floorWithLamp();
    expect(
      gizmoEditOps(floor, specOf, edit({ seq: 4, type: 'rotate', id: SOFA_ID, degrees: 15 })),
    ).toEqual([
      { op: 'update', kind: 'object', floorId: FLOOR_ID, id: SOFA_ID, patch: { rotation: 15 } },
    ]);
    expect(
      gizmoEditOps(floor, specOf, edit({ seq: 4, type: 'rotate', id: DEVICE_ID, degrees: 45 })),
    ).toEqual([
      {
        op: 'update',
        kind: 'placement',
        floorId: FLOOR_ID,
        id: DEVICE_ID,
        patch: { rotation: 45, auto: false },
      },
    ]);
  });

  it('turns a resize into the model size params, clamped to the model limits', () => {
    const floor = floorWithLamp();
    const box = { at: { x: 2.2, y: 2 }, rotation: 0, w: 3.5, d: 1.4, h: null };
    const [op] = gizmoEditOps(floor, specOf, edit({ seq: 4, type: 'resize', id: SOFA_ID, box }));
    expect(op).toEqual({
      op: 'update',
      kind: 'object',
      floorId: FLOOR_ID,
      id: SOFA_ID,
      patch: { at: { x: 2.2, y: 2 }, rotation: 0, params: { width: 3 } },
    });
  });

  it('moves a room by the dragged offset and ignores edits of a locked or missing item', () => {
    const floor = floorWithLamp();
    expect(
      gizmoEditOps(
        floor,
        specOf,
        edit({ seq: 4, type: 'room-move', id: BIG, by: { x: 0.5, y: -0.2 } }),
      ),
    ).toEqual([{ op: 'move', kind: 'room', floorId: FLOOR_ID, id: BIG, dx: 0.5, dy: -0.2 }]);
    const locked = floorWithLamp('floor', true);
    expect(
      gizmoEditOps(locked, specOf, edit({ seq: 4, type: 'rotate', id: SOFA_ID, degrees: 15 })),
    ).toEqual([]);
    expect(
      gizmoEditOps(
        floor,
        specOf,
        edit({ seq: 4, type: 'room-move', id: 'gone', by: { x: 1, y: 0 } }),
      ),
    ).toEqual([]);
  });

  it('leaves taps, menus and anchors to the stage menu', () => {
    const tap: EditEvent = {
      seq: 1,
      type: 'tap',
      point: { x: 1, y: 1 },
      floorId: FLOOR_ID,
      hit: { kind: 'none' },
      metresPerPx: 0.01,
    };
    expect(isGizmoEdit(tap)).toBe(false);
  });
});

describe('room actions', () => {
  it('offers Delete room in the menu and the bar', () => {
    const target = roomTarget(floorWithLamp());
    for (const surface of ['menu', 'bar'] as const) {
      expect(objectActions(target, surface, false).map((action) => action.label)).toEqual([
        'Delete room',
      ]);
    }
    expect(objectActions(target, 'menu', true)[0]?.disabled).toBe(true);
  });

  it('deletes the room, nudges it with the arrow keys and ignores the other keys', () => {
    const floor = floorWithLamp();
    const target = roomTarget(floor);
    const scene = { floor, specOf, newId: (): string => 'copy' };
    expect(runAction(scene, target, 'delete')).toEqual({
      kind: 'ops',
      ops: [{ op: 'remove', kind: 'room', floorId: FLOOR_ID, id: BIG }],
      select: null,
    });
    expect(commandOutcome(scene, target, { kind: 'nudge', dx: 0.1, dy: 0 })).toEqual({
      kind: 'ops',
      ops: [{ op: 'move', kind: 'room', floorId: FLOOR_ID, id: BIG, dx: 0.1, dy: 0 }],
      select: BIG,
    });
    expect(commandOutcome(scene, target, { kind: 'action', id: 'flip' })).toEqual({
      kind: 'ops',
      ops: [],
      select: BIG,
    });
  });
});
