import { describe, expect, it, vi } from 'vitest';
import {
  HOME_MAP_PLACEMENT_WRITE,
  HOME_MAP_ROOM_WRITE,
  HOME_MAP_WRITE,
  applyHomeMapEdits,
  homeMapBoxCorners,
  homeMapPointInPolygon,
  type HomeMap,
  type HomeMapFloor,
  type HomeMapObject,
  type HomeMapOp,
  type HomeMapPlacement,
} from '@smarteverything/domain';
import {
  BIG,
  FLOOR_ID,
  SOFA_ID,
  floorWith,
  onlyObject,
  sofa,
  specOf,
} from '../tools/furniture-fixture';
import { boxOf } from '../../../../components/house-map/edit/furniture-box';
import { NO_SPOT_TEXT } from '../tools/furniture-model';
import { NO_EDIT_OVERLAY } from '../../../../components/house-map/3d/map-3d-edit-protocol';
import { GIZMO_START } from '../tool-state';
import {
  boxesOverlap,
  commandOutcome,
  keyCommand,
  lookOps,
  moveToRoom,
  objectActions,
  quarterTurn,
  runAction,
  type ActionOutcome,
  type ActionScene,
  type ActionTarget,
  type KeyCommand,
} from './object-actions';
import {
  routeKey,
  type EditorHistory,
  type EditorKeys,
  type Manipulation,
} from './use-manipulation';

const COPY_ID = '00000000-0000-4000-8000-0000000000c2';
const DEVICE_ID = '00000000-0000-4000-8000-0000000000d1';
const SIDE = '00000000-0000-4000-8000-0000000000e1';
const CONTEXT = { actor: 'profile:test', at: '2026-10-25T01:00:00.000Z' } as const;

function withSideRoom(floor: HomeMapFloor): HomeMapFloor {
  const big = floor.rooms.find((room) => room.id === BIG);
  if (big === undefined) throw new Error('no room');
  const outer = big.polygon.outer.map((p) => ({ x: p.x + 6, y: p.y }));
  const side = HOME_MAP_ROOM_WRITE.parse({ ...big, id: SIDE, polygon: { outer, holes: [] } });
  return { ...floor, rooms: [...floor.rooms, side] };
}

function mapOf(floor: HomeMapFloor): HomeMap {
  return HOME_MAP_WRITE.parse({
    schemaVersion: 1,
    id: 'home',
    name: 'Test house',
    revision: 1,
    updatedAt: '2026-10-25T00:00:00.000Z',
    north: 0,
    floors: [floor],
    sources: [],
    notices: [],
  });
}

function sceneOf(floor: HomeMapFloor): ActionScene {
  return { floor, specOf, newId: () => COPY_ID };
}

function opsOf(outcome: ActionOutcome): readonly HomeMapOp[] {
  if (outcome.kind !== 'ops') throw new Error(`expected ops, got ${outcome.kind}`);
  return outcome.ops;
}

function applied(floor: HomeMapFloor, ops: readonly HomeMapOp[]): HomeMapFloor {
  const result = applyHomeMapEdits(mapOf(floor), ops, CONTEXT);
  expect(result.conflicts).toEqual([]);
  const next = result.map.floors[0];
  if (next === undefined) throw new Error('no floor');
  return next;
}

function objectNamed(floor: HomeMapFloor, id: string): HomeMapObject {
  const found = floor.objects.find((item) => item.id === id);
  if (found === undefined) throw new Error(`no ${id}`);
  return found;
}

const sofaTarget = (floor: HomeMapFloor): ActionTarget => ({
  kind: 'object',
  object: onlyObject(floor),
});

const lamp: HomeMapPlacement = HOME_MAP_PLACEMENT_WRITE.parse({
  deviceId: DEVICE_ID,
  floorId: FLOOR_ID,
  at: { x: 1, y: 1 },
  rotation: 300,
  height: 0,
  tilt: 0,
  mount: 'floor',
  auto: true,
  camera: null,
});

describe('object actions offered', () => {
  it('lists the menu and bar actions of an object and hides Flip, Duplicate and Style for devices', () => {
    const floor = floorWith([sofa()]);
    expect(objectActions(sofaTarget(floor), 'menu', false).map((a) => a.label)).toEqual([
      'Turn 90°',
      'Flip',
      'Duplicate',
      'Colour and style',
      'Move to another room',
      'Lock position',
      'Delete',
    ]);
    expect(objectActions(sofaTarget(floor), 'bar', false).map((a) => a.label)).toEqual([
      'Turn 90°',
      'Flip',
      'Duplicate',
      'Style',
      'Move to',
      'Lock',
      'Delete',
    ]);
    expect(objectActions(sofaTarget(floor), 'menu', false).map((a) => a.shortcut)).toEqual([
      'Q',
      'F',
      'Ctrl+D',
      null,
      null,
      'Ctrl+L',
      'Del',
    ]);
    const device = objectActions({ kind: 'device', placement: lamp }, 'menu', false);
    expect(device.map((a) => a.label)).toEqual([
      'Turn 90°',
      'Move to another room',
      'Remove from map',
    ]);
  });

  it('disables everything read only and the positional actions of a locked object', () => {
    const locked = floorWith([sofa(true)]);
    const actions = objectActions(sofaTarget(locked), 'menu', false);
    const disabled = actions.filter((a) => a.disabled).map((a) => a.id);
    expect(disabled).toEqual(['rotate', 'move']);
    expect(actions.find((a) => a.id === 'lock')?.label).toBe('Unlock position');
    const all = objectActions(sofaTarget(floorWith([sofa()])), 'bar', true);
    expect(all.every((a) => a.disabled)).toBe(true);
  });
});

describe('action ops', () => {
  it('Turn 90° adds 90 degrees and wraps past a full turn', () => {
    const floor = floorWith([sofa()]);
    const next = applied(floor, opsOf(runAction(sceneOf(floor), sofaTarget(floor), 'rotate')));
    expect(onlyObject(next).rotation).toBe(90);
    expect(quarterTurn(300, 90)).toBe(30);
  });

  it('Flip toggles the flipped flag and Lock toggles the lock, both undoable', () => {
    const floor = floorWith([sofa()]);
    const scene = sceneOf(floor);
    const flipped = applied(floor, opsOf(runAction(scene, sofaTarget(floor), 'flip')));
    expect(onlyObject(flipped).flipped).toBe(true);
    const back = applied(flipped, opsOf(runAction(sceneOf(flipped), sofaTarget(flipped), 'flip')));
    expect(onlyObject(back).flipped).toBe(false);
    const result = applyHomeMapEdits(
      mapOf(floor),
      opsOf(runAction(scene, sofaTarget(floor), 'lock')),
      CONTEXT,
    );
    expect(result.map.floors[0]?.objects[0]?.locked).toBe(true);
    const undone = applyHomeMapEdits(result.map, result.inverse, CONTEXT);
    expect(undone.map.floors[0]?.objects[0]?.locked).toBe(false);
  });

  it('Duplicate adds a copy with a new id at the nearest free spot beside it inside the room', () => {
    const floor = floorWith([sofa(true)]);
    const outcome = runAction(sceneOf(floor), sofaTarget(floor), 'duplicate');
    expect(outcome.kind === 'ops' && outcome.select).toBe(COPY_ID);
    const next = applied(floor, opsOf(outcome));
    const copy = objectNamed(next, COPY_ID);
    const original = objectNamed(next, SOFA_ID);
    expect(copy.locked).toBe(false);
    expect(copy.modelId).toBe(original.modelId);
    expect(boxesOverlap(boxOf(copy, specOf), boxOf(original, specOf))).toBe(false);
    const room = next.rooms.find((item) => item.id === BIG);
    if (room === undefined) throw new Error('no room');
    const corners = homeMapBoxCorners(boxOf(copy, specOf));
    expect(corners.every((corner) => homeMapPointInPolygon(room.polygon, corner))).toBe(true);
    const distance = Math.hypot(copy.at.x - original.at.x, copy.at.y - original.at.y);
    expect(distance).toBeLessThan(1.5);
  });

  it('Duplicate reports the notice when the room has no free spot', () => {
    const floor = floorWith([{ ...sofa(), at: { x: 10.3, y: 0.3 } }]);
    expect(runAction(sceneOf(floor), sofaTarget(floor), 'duplicate')).toEqual({
      kind: 'blocked',
      notice: NO_SPOT_TEXT,
    });
  });

  it('Delete removes the object and Undo restores it; a device is removed from the map', () => {
    const floor = floorWith([sofa()]);
    const result = applyHomeMapEdits(
      mapOf(floor),
      opsOf(runAction(sceneOf(floor), sofaTarget(floor), 'delete')),
      CONTEXT,
    );
    expect(result.map.floors[0]?.objects).toEqual([]);
    expect(
      applyHomeMapEdits(result.map, result.inverse, CONTEXT).map.floors[0]?.objects,
    ).toHaveLength(1);
    const withLamp = { ...floor, placements: [lamp] };
    const removed = applied(
      withLamp,
      opsOf(runAction(sceneOf(withLamp), { kind: 'device', placement: lamp }, 'delete')),
    );
    expect(removed.placements).toEqual([]);
  });

  it('Move to another room puts the object on a free spot in that room', () => {
    const floor = withSideRoom(floorWith([sofa()]));
    const next = applied(floor, opsOf(moveToRoom(sceneOf(floor), sofaTarget(floor), SIDE)));
    const room = next.rooms.find((item) => item.id === SIDE);
    if (room === undefined) throw new Error('no room');
    const corners = homeMapBoxCorners(boxOf(onlyObject(next), specOf));
    expect(corners.every((corner) => homeMapPointInPolygon(room.polygon, corner))).toBe(true);
  });

  it('Move to another room places a device on a spot inside the chosen room', () => {
    const floor = withSideRoom({ ...floorWith([]), placements: [lamp] });
    const outcome = moveToRoom(sceneOf(floor), { kind: 'device', placement: lamp }, SIDE);
    const room = floor.rooms.find((item) => item.id === SIDE);
    if (outcome.kind !== 'placeDevice' || room === undefined) throw new Error('no spot');
    expect(outcome.deviceId).toBe(DEVICE_ID);
    expect(homeMapPointInPolygon(room.polygon, outcome.at)).toBe(true);
  });

  it('a colour or style choice writes the finish or the style', () => {
    const floor = floorWith([sofa()]);
    const object = onlyObject(floor);
    const finish = applied(
      floor,
      opsOf(
        lookOps(FLOOR_ID, object, { kind: 'finish', value: 'slate', label: 'Slate', on: false }),
      ),
    );
    expect(onlyObject(finish).finish).toBe('slate');
    const style = applied(
      floor,
      opsOf(
        lookOps(FLOOR_ID, object, { kind: 'style', value: 'classic', label: 'Classic', on: false }),
      ),
    );
    expect(onlyObject(style).style).toBe('classic');
  });
});

describe('keyboard', () => {
  it('maps the keys of the design to commands', () => {
    const press = (key: string, shift = false, mod = false): unknown =>
      keyCommand({ key, shift, mod });
    expect(press('ArrowRight')).toEqual({ kind: 'nudge', dx: 0.1, dy: 0 });
    expect(press('ArrowUp', true)).toEqual({ kind: 'nudge', dx: 0, dy: 0.01 });
    expect(press('ArrowUp', false, true)).toBeNull();
    expect(press('w')).toEqual({ kind: 'mode', mode: 'move' });
    expect(press('E')).toEqual({ kind: 'mode', mode: 'rotate' });
    expect(press('r')).toEqual({ kind: 'mode', mode: 'scale' });
    expect(press('s')).toEqual({ kind: 'snapping' });
    expect(press('x')).toEqual({ kind: 'space' });
    expect(press('q')).toEqual({ kind: 'action', id: 'rotate' });
    expect(press('Q', true)).toEqual({ kind: 'turn', degrees: 15 });
    expect(press('f')).toEqual({ kind: 'action', id: 'flip' });
    expect(press('d', false, true)).toEqual({ kind: 'action', id: 'duplicate' });
    expect(press('l', false, true)).toEqual({ kind: 'action', id: 'lock' });
    expect(press('z', false, true)).toEqual({ kind: 'undo' });
    expect(press('Z', true, true)).toEqual({ kind: 'redo' });
    expect(press('Delete')).toEqual({ kind: 'action', id: 'delete' });
    expect(press('ContextMenu')).toEqual({ kind: 'menu' });
    expect(press('F10', true)).toEqual({ kind: 'menu' });
  });

  it('leaves browser shortcuts and the old letters alone', () => {
    const press = (key: string, shift = false, mod = false): unknown =>
      keyCommand({ key, shift, mod });
    for (const key of ['w', 'r', 'e', 's', 'x', 'q', 'f', 't']) {
      expect(press(key, false, true)).toBeNull();
    }
    expect(press('l')).toBeNull();
    expect(press('d')).toBeNull();
    expect(press('z')).toBeNull();
  });

  it('nudges with a move op that the lock refuses, and nudges a device placement', () => {
    const floor = floorWith([sofa()]);
    const next = applied(
      floor,
      opsOf(commandOutcome(sceneOf(floor), sofaTarget(floor), { kind: 'nudge', dx: 0.1, dy: 0 })),
    );
    expect(onlyObject(next).at.x).toBeCloseTo(2.1);
    const locked = floorWith([sofa(true)]);
    expect(
      opsOf(commandOutcome(sceneOf(locked), sofaTarget(locked), { kind: 'nudge', dx: 0.1, dy: 0 })),
    ).toEqual([]);
    const withLamp = { ...floor, placements: [lamp] };
    const moved = applied(
      withLamp,
      opsOf(
        commandOutcome(
          sceneOf(withLamp),
          { kind: 'device', placement: lamp },
          { kind: 'nudge', dx: 0, dy: -0.01 },
        ),
      ),
    );
    expect(moved.placements[0]?.at.y).toBeCloseTo(0.99);
    expect(moved.placements[0]?.auto).toBe(false);
  });

  it('Shift Q turns by the step and a device turns through its placement', () => {
    const floor = { ...floorWith([sofa()]), placements: [lamp] };
    const turned = applied(
      floor,
      opsOf(commandOutcome(sceneOf(floor), sofaTarget(floor), { kind: 'turn', degrees: 15 })),
    );
    expect(onlyObject(turned).rotation).toBe(15);
    const device = applied(
      floor,
      opsOf(
        commandOutcome(
          sceneOf(floor),
          { kind: 'device', placement: lamp },
          { kind: 'action', id: 'rotate' },
        ),
      ),
    );
    expect(device.placements[0]?.rotation).toBe(30);
    expect(
      opsOf(
        commandOutcome(
          sceneOf(floor),
          { kind: 'device', placement: lamp },
          { kind: 'action', id: 'flip' },
        ),
      ),
    ).toEqual([]);
  });
});

describe('key routing', () => {
  interface Routing {
    readonly keys: EditorKeys;
    readonly gizmo: Pick<Manipulation, 'setMode' | 'toggleSnapping' | 'toggleSpace'>;
    readonly history: EditorHistory;
    readonly onSelection: () => void;
  }

  function keysOf(active: boolean, selected: boolean, undo = true): Routing {
    const gizmo = { setMode: vi.fn(), toggleSnapping: vi.fn(), toggleSpace: vi.fn() };
    const history: EditorHistory = {
      state: { connected: true, status: { kind: 'idle' }, canUndo: undo, canRedo: false },
      undo: vi.fn(() => Promise.resolve({ kind: 'saved' } as const)),
      redo: vi.fn(() => Promise.resolve({ kind: 'saved' } as const)),
    };
    const onSelection = vi.fn();
    const manipulation: Manipulation = {
      ...gizmo,
      gizmo: GIZMO_START,
      modes: ['move', 'rotate'],
      locked: false,
      overlay: NO_EDIT_OVERLAY,
      notice: null,
      onEdit: vi.fn(),
    };
    const keys = {
      active,
      manipulation,
      history,
      onSelection: selected ? onSelection : null,
      onClear: vi.fn(),
    };
    return { keys, gizmo, history, onSelection };
  }

  const key = (name: string, shift = false, mod = false): KeyCommand | null =>
    keyCommand({ key: name, shift, mod });

  it('sends W E R, S and X to the gizmo and skips a mode the selection cannot use', () => {
    const { keys, gizmo } = keysOf(true, true);
    expect(routeKey(keys, key('e'))).toBe(true);
    expect(gizmo.setMode).toHaveBeenCalledWith('rotate');
    expect(routeKey(keys, key('r'))).toBe(false);
    routeKey(keys, key('s'));
    routeKey(keys, key('x'));
    expect(gizmo.toggleSnapping).toHaveBeenCalledTimes(1);
    expect(gizmo.toggleSpace).toHaveBeenCalledTimes(1);
  });

  it('sends the selection keys to the selection and ignores them without one', () => {
    const { keys, onSelection } = keysOf(true, true);
    expect(routeKey(keys, key('q'))).toBe(true);
    expect(onSelection).toHaveBeenCalledWith({ kind: 'action', id: 'rotate' });
    const idle = keysOf(true, false);
    expect(routeKey(idle.keys, key('Delete'))).toBe(false);
    expect(routeKey(idle.keys, key('w'))).toBe(false);
    expect(routeKey(keysOf(false, true).keys, key('q'))).toBe(false);
    expect(routeKey(keys, null)).toBe(false);
  });

  it('undoes and redoes in every tool only when history allows it', () => {
    const { keys, history } = keysOf(false, false);
    expect(routeKey(keys, key('z', false, true))).toBe(true);
    expect(history.undo).toHaveBeenCalledTimes(1);
    expect(routeKey(keys, key('z', true, true))).toBe(false);
    expect(history.redo).not.toHaveBeenCalled();
    expect(routeKey(keysOf(true, true, false).keys, key('z', false, true))).toBe(false);
  });
});
