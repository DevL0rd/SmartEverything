import { describe, expect, it } from 'vitest';
import {
  HOME_MAP_FLOOR,
  HOME_MAP_PLACEMENT_WRITE,
  type HomeMapFloor,
} from '@smarteverything/domain';
import type { HomeMapEditorState } from '../data/edits';
import { FLOOR_ID, SOFA_ID, floorWith, sofa } from './tools/furniture-fixture';
import {
  EDITOR_TOOLS,
  GIZMO_START,
  INITIAL_TOOL_STATE,
  acceptedSave,
  entryToolState,
  floorEmpty,
  floorOptions,
  gizmoFor,
  MAIN_TOOLS,
  MORE_TOOLS,
  historyButtons,
  moreSlot,
  nextFloorLevel,
  nextFloorName,
  openEmptyFloor,
  reduceGizmo,
  reduceTool,
  saveLine,
  selectMoveOps,
  shownFloorId,
  shownTool,
  toolEnabled,
  type MapFloors,
  type MoveEdit,
} from './tool-state';

function floor(id: string, level: number): HomeMapFloor {
  return HOME_MAP_FLOOR.parse({
    id,
    name: id,
    level,
    elevation: level * 3,
    rooms: [],
    walls: [],
    openings: [],
    objects: [],
    placements: [],
    annotations: [],
  });
}

function mapWith(floors: readonly HomeMapFloor[]): MapFloors {
  return { floors: [...floors] };
}

const LIVE: HomeMapEditorState = {
  status: { kind: 'idle' },
  connected: true,
  canUndo: true,
  canRedo: true,
};

describe('editor tools', () => {
  it('offers five main tools and the rest under the More slot', () => {
    expect(MAIN_TOOLS.map((tool) => tool.id)).toEqual([
      'select',
      'rooms',
      'walls',
      'furniture',
      'devices',
    ]);
    expect(MORE_TOOLS.map((tool) => tool.id)).toEqual([
      'openings',
      'materials',
      'measure',
      'notes',
      'align',
      'scan',
    ]);
    expect(MAIN_TOOLS.length + MORE_TOOLS.length).toBe(EDITOR_TOOLS.length);
  });

  it('shows the active extra tool in the More slot', () => {
    expect(moreSlot('select')).toBeNull();
    expect(moreSlot('walls')).toBeNull();
    expect(moreSlot('openings')).toMatchObject({ label: 'Doors', icon: 'door' });
    expect(moreSlot('scan')).toMatchObject({ label: 'Realistic' });
  });

  it('opens in Top and keeps the camera the person picks', () => {
    expect(INITIAL_TOOL_STATE.camera).toBe('top');
    const side = reduceTool(INITIAL_TOOL_STATE, { type: 'camera', camera: 'side' });
    expect(side.camera).toBe('side');
    expect(reduceTool(side, { type: 'camera', camera: 'side' })).toBe(side);
    expect(reduceTool(side, { type: 'pick', tool: 'walls' }).camera).toBe('side');
  });

  it('picks a tool, clears the selection and opens More for a More tool', () => {
    const selected = reduceTool(INITIAL_TOOL_STATE, { type: 'select', id: 'room-1' });
    const walls = reduceTool(selected, { type: 'pick', tool: 'walls' });
    expect(walls).toMatchObject({ tool: 'walls', selected: null, more: false });
    expect(reduceTool(walls, { type: 'pick', tool: 'measure' })).toMatchObject({
      tool: 'measure',
      more: true,
    });
    expect(reduceTool(walls, { type: 'pick', tool: 'walls' })).toBe(walls);
  });

  it('toggles More, changes floor and clears the selection', () => {
    const open = reduceTool(INITIAL_TOOL_STATE, { type: 'toggleMore' });
    expect(open.more).toBe(true);
    const chosen = reduceTool(open, { type: 'select', id: 'sofa' });
    expect(reduceTool(chosen, { type: 'floor', floorId: 'up', empty: false })).toMatchObject({
      floorId: 'up',
      selected: null,
      tool: 'select',
    });
    expect(reduceTool(chosen, { type: 'clear' }).selected).toBeNull();
  });

  it('opens the scan align tool from a link and keeps the map or list view', () => {
    expect(entryToolState({ tool: 'scan' })).toMatchObject({ tool: 'scan', more: true });
    expect(INITIAL_TOOL_STATE.view).toBe('map');
    const list = reduceTool(INITIAL_TOOL_STATE, { type: 'view', view: 'list' });
    expect(list.view).toBe('list');
    expect(reduceTool(list, { type: 'view', view: 'list' })).toBe(list);
    expect(reduceTool(list, { type: 'pick', tool: 'walls' }).view).toBe('list');
  });

  it('keeps only viewing tools while read only', () => {
    expect(EDITOR_TOOLS.filter((tool) => toolEnabled(tool, true))).toEqual(['select', 'measure']);
    expect(EDITOR_TOOLS.every((tool) => toolEnabled(tool, false))).toBe(true);
    const walls = reduceTool(INITIAL_TOOL_STATE, { type: 'pick', tool: 'walls' });
    expect(shownTool(walls, true)).toBe('select');
    expect(shownTool(walls, false)).toBe('walls');
  });
});

describe('editor floors', () => {
  const map = mapWith([floor('up', 1), floor('ground', 0)]);

  it('opens the Rooms tool by itself on an empty floor', () => {
    expect(
      reduceTool(INITIAL_TOOL_STATE, { type: 'floor', floorId: 'up', empty: true }),
    ).toMatchObject({ floorId: 'up', tool: 'rooms' });
    expect(openEmptyFloor(INITIAL_TOOL_STATE, true).tool).toBe('rooms');
    expect(openEmptyFloor(INITIAL_TOOL_STATE, false)).toBe(INITIAL_TOOL_STATE);
    expect(floorEmpty(map, 'up')).toBe(true);
    expect(floorEmpty(map, 'gone')).toBe(false);
    expect(floorEmpty(map, null)).toBe(false);
  });

  it('lists the floors for the stage switch from the lowest up', () => {
    expect(floorOptions(map)).toEqual([
      { id: 'ground', label: 'ground' },
      { id: 'up', label: 'up' },
    ]);
  });

  it('shows the lowest floor until one is chosen and drops a removed choice', () => {
    expect(shownFloorId(map, INITIAL_TOOL_STATE)).toBe('ground');
    expect(shownFloorId(map, { ...INITIAL_TOOL_STATE, floorId: 'up' })).toBe('up');
    expect(shownFloorId(map, { ...INITIAL_TOOL_STATE, floorId: 'gone' })).toBe('ground');
    expect(shownFloorId(mapWith([]), INITIAL_TOOL_STATE)).toBeNull();
  });

  it('adds the next floor above the top one', () => {
    expect(nextFloorLevel(map)).toBe(2);
    expect(nextFloorName(map)).toBe('Floor 3');
    expect(nextFloorLevel(mapWith([]))).toBe(0);
  });
});

describe('editor save status', () => {
  it('says Saved, Saving and Offline from the editor state', () => {
    expect(saveLine(LIVE)).toEqual({ text: 'Saved', tone: 'positive' });
    expect(saveLine({ ...LIVE, status: { kind: 'saving' } }).tone).toBe('variant');
    expect(saveLine({ ...LIVE, connected: false })).toEqual({
      text: 'Offline: editing is paused',
      tone: 'warning',
    });
    expect(saveLine({ ...LIVE, status: { kind: 'not_saved' } })).toEqual({
      text: 'Your last change did not save: try again',
      tone: 'critical',
    });
  });

  it('allows undo and redo only while connected, idle and with steps', () => {
    expect(historyButtons(LIVE)).toEqual({ undo: true, redo: true });
    expect(historyButtons({ ...LIVE, connected: false })).toEqual({ undo: false, redo: false });
    expect(historyButtons({ ...LIVE, status: { kind: 'saving' } })).toEqual({
      undo: false,
      redo: false,
    });
    expect(historyButtons({ ...LIVE, canRedo: false })).toEqual({ undo: true, redo: false });
  });

  it('tells the scene an edit stuck only when it saved or may have saved', () => {
    expect(acceptedSave({ kind: 'saved' })).toBe(true);
    expect(acceptedSave({ kind: 'unconfirmed' })).toBe(true);
    expect(acceptedSave({ kind: 'not_saved' })).toBe(false);
    expect(acceptedSave({ kind: 'conflicts', messages: ['gone'] })).toBe(false);
    expect(acceptedSave({ kind: 'idle' })).toBe(false);
  });
});

const LAMP = '00000000-0000-4000-8000-0000000000b1';

const LAMP_SPOT = HOME_MAP_PLACEMENT_WRITE.parse({
  deviceId: LAMP,
  floorId: FLOOR_ID,
  at: { x: 2, y: 2 },
  rotation: 0,
  height: 0,
  tilt: 0,
  mount: 'floor',
  auto: true,
  camera: null,
});

const FURNISHED: HomeMapFloor = { ...floorWith([sofa()]), placements: [LAMP_SPOT] };

function moveOf(id: string, change: Partial<MoveEdit> = {}): MoveEdit {
  return {
    seq: 3,
    type: 'move',
    id,
    at: { x: 4, y: 5 },
    rotation: 90,
    wall: null,
    height: null,
    elevation: null,
    mount: null,
    ...change,
  };
}

describe('Select editing in 3D', () => {
  it('turns a body drag of furniture into one object update', () => {
    expect(selectMoveOps(FURNISHED, moveOf(SOFA_ID, { elevation: 0.4 }))).toEqual([
      {
        op: 'update',
        kind: 'object',
        floorId: FLOOR_ID,
        id: SOFA_ID,
        patch: { at: { x: 4, y: 5 }, rotation: 90, elevation: 0.4 },
      },
    ]);
  });

  it('turns a body drag of a device into one manual placement update', () => {
    expect(selectMoveOps(FURNISHED, moveOf(LAMP, { height: 1.2, mount: 'table' }))).toEqual([
      {
        op: 'update',
        kind: 'placement',
        floorId: FLOOR_ID,
        id: LAMP,
        patch: { at: { x: 4, y: 5 }, rotation: 90, height: 1.2, mount: 'table', auto: false },
      },
    ]);
  });

  it('sends nothing for an id that is not on the floor', () => {
    expect(selectMoveOps(FURNISHED, moveOf('00000000-0000-4000-8000-0000000000c9'))).toEqual([]);
  });
});

describe('entryToolState', () => {
  it('starts on the tool, device and category a link names', () => {
    expect(entryToolState({ tool: 'devices', device: 'lamp-1' })).toMatchObject({
      tool: 'devices',
      selected: 'lamp-1',
    });
    expect(entryToolState({ tool: 'furniture', category: 'sofas' })).toMatchObject({
      tool: 'furniture',
      category: 'sofas',
    });
    expect(entryToolState({ tool: 'measure' })).toMatchObject({ tool: 'measure', more: true });
  });

  it('falls back to Select for missing or unknown values', () => {
    expect(entryToolState({})).toEqual(INITIAL_TOOL_STATE);
    expect(entryToolState({ tool: 'bogus', device: 5 })).toEqual(INITIAL_TOOL_STATE);
  });
});

describe('gizmo mode state', () => {
  it('starts in Move with local axes and snapping on', () => {
    expect(GIZMO_START).toEqual({ mode: 'move', space: 'local', snapping: true, owner: null });
  });

  it('keeps the chosen mode for the item it was chosen on and goes back to Move after every select', () => {
    const turned = reduceGizmo(GIZMO_START, { type: 'mode', mode: 'rotate', owner: 'sofa' });
    expect(gizmoFor(turned, 'sofa').mode).toBe('rotate');
    const other = reduceGizmo(turned, { type: 'select', owner: 'lamp' });
    expect(other).toMatchObject({ mode: 'move', owner: 'lamp' });
    expect(reduceGizmo(other, { type: 'select', owner: 'sofa' }).mode).toBe('move');
    expect(reduceGizmo(turned, { type: 'select', owner: 'sofa' })).toBe(turned);
  });

  it('flips the axes and snapping and keeps them across selections', () => {
    const world = reduceGizmo(GIZMO_START, { type: 'space' });
    const free = reduceGizmo(world, { type: 'snapping' });
    expect(free).toMatchObject({ space: 'world', snapping: false });
    expect(gizmoFor(free, 'sofa')).toMatchObject({ space: 'world', snapping: false, mode: 'move' });
    expect(reduceGizmo(reduceGizmo(free, { type: 'space' }), { type: 'snapping' })).toMatchObject({
      space: 'local',
      snapping: true,
    });
  });
});
