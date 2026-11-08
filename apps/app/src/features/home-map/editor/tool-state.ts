import { z } from 'zod';
import type { HomeMap, HomeMapFloor, HomeMapOp } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon-glyphs';
import type { CameraPresetId } from '../../../components/house-map/3d/render-core-orbit';
import type {
  EditEvent,
  GIZMO_MODES,
  GIZMO_SPACES,
} from '../../../components/house-map/3d/map-3d-edit-protocol';
import { objectOp } from '../../../components/house-map/edit/ops';
import type { StageFloor } from '../components/stage/stage-chrome';
import {
  OFFLINE_TEXT,
  editorNotice,
  type HomeMapEditorState,
  type HomeMapSaveStatus,
} from '../data/edits';
import { describePlan } from '../../../components/house-map/plan/rooms';
import type { RenderFloor } from '../../../components/house-map/render-scene';

export type MapFloors = Pick<HomeMap, 'floors'>;

export const EDITOR_TOOLS = [
  'select',
  'rooms',
  'walls',
  'openings',
  'furniture',
  'devices',
  'materials',
  'measure',
  'notes',
  'align',
  'scan',
] as const;

export type EditorTool = (typeof EDITOR_TOOLS)[number];

export interface EditorToolInfo {
  readonly id: EditorTool;
  readonly label: string;
  readonly title: string;
  readonly icon: IconName;
  readonly edits: boolean;
  readonly main: boolean;
}

export const TOOL_INFO: Readonly<Record<EditorTool, EditorToolInfo>> = {
  select: {
    id: 'select',
    label: 'Select',
    title: 'Select',
    icon: 'squareMousePointer',
    edits: false,
    main: true,
  },
  rooms: { id: 'rooms', label: 'Rooms', title: 'Rooms', icon: 'square', edits: true, main: true },
  walls: { id: 'walls', label: 'Walls', title: 'Walls', icon: 'pencil', edits: true, main: true },
  openings: {
    id: 'openings',
    label: 'Doors',
    title: 'Doors and windows',
    icon: 'door',
    edits: true,
    main: false,
  },
  furniture: {
    id: 'furniture',
    label: 'Furniture',
    title: 'Furniture',
    icon: 'sofa',
    edits: true,
    main: true,
  },
  devices: {
    id: 'devices',
    label: 'Devices',
    title: 'Devices',
    icon: 'plug',
    edits: true,
    main: true,
  },
  materials: {
    id: 'materials',
    label: 'Materials',
    title: 'Materials',
    icon: 'palette',
    edits: true,
    main: false,
  },
  measure: {
    id: 'measure',
    label: 'Measure',
    title: 'Measure',
    icon: 'ruler',
    edits: false,
    main: false,
  },
  notes: {
    id: 'notes',
    label: 'Notes',
    title: 'Notes',
    icon: 'fileText',
    edits: true,
    main: false,
  },
  align: {
    id: 'align',
    label: 'Vacuum map',
    title: 'Align vacuum map',
    icon: 'vacuum',
    edits: true,
    main: false,
  },
  scan: {
    id: 'scan',
    label: 'Realistic',
    title: 'Align realistic view',
    icon: 'image',
    edits: true,
    main: false,
  },
};

export const EDITOR_VIEWS = ['map', 'list'] as const;

export type EditorView = (typeof EDITOR_VIEWS)[number];

export const MAIN_TOOLS: readonly EditorToolInfo[] = EDITOR_TOOLS.map((id) => TOOL_INFO[id]).filter(
  (tool) => tool.main,
);

export const MORE_TOOLS: readonly EditorToolInfo[] = EDITOR_TOOLS.map((id) => TOOL_INFO[id]).filter(
  (tool) => !tool.main,
);

export interface ToolState {
  readonly tool: EditorTool;
  readonly more: boolean;
  readonly floorId: string | null;
  readonly selected: string | null;
  readonly category: string | null;
  readonly view: EditorView;
  readonly camera: CameraPresetId;
}

export type ToolEvent =
  | { readonly type: 'pick'; readonly tool: EditorTool }
  | { readonly type: 'toggleMore' }
  | { readonly type: 'view'; readonly view: EditorView }
  | { readonly type: 'camera'; readonly camera: CameraPresetId }
  | { readonly type: 'floor'; readonly floorId: string; readonly empty: boolean }
  | { readonly type: 'select'; readonly id: string }
  | { readonly type: 'clear' };

export const INITIAL_TOOL_STATE: ToolState = {
  tool: 'select',
  more: false,
  floorId: null,
  selected: null,
  category: null,
  view: 'map',
  camera: 'top',
};

const EDITOR_ENTRY = z.object({
  tool: z.enum(EDITOR_TOOLS).catch('select'),
  device: z.string().min(1).optional().catch(undefined),
  category: z.string().min(1).optional().catch(undefined),
});

export function entryToolState(params: Readonly<Record<string, unknown>>): ToolState {
  const entry = EDITOR_ENTRY.parse(params);
  const base = reduceTool(INITIAL_TOOL_STATE, { type: 'pick', tool: entry.tool });
  return {
    ...base,
    selected: entry.device ?? null,
    category: entry.category ?? null,
  };
}

export function toolEnabled(tool: EditorTool, readOnly: boolean): boolean {
  return !readOnly || !TOOL_INFO[tool].edits;
}

function pick(state: ToolState, tool: EditorTool): ToolState {
  if (state.tool === tool) return state;
  return {
    ...state,
    tool,
    more: TOOL_INFO[tool].main ? state.more : true,
    selected: null,
    category: null,
  };
}

export function openEmptyFloor(state: ToolState, empty: boolean): ToolState {
  return empty ? pick(state, 'rooms') : state;
}

function chooseFloor(state: ToolState, floorId: string, empty: boolean): ToolState {
  if (state.floorId === floorId) return state;
  return openEmptyFloor({ ...state, floorId, selected: null }, empty);
}

function patched<K extends keyof ToolState>(
  state: ToolState,
  key: K,
  value: ToolState[K],
): ToolState {
  return state[key] === value ? state : { ...state, [key]: value };
}

export function reduceTool(state: ToolState, event: ToolEvent): ToolState {
  switch (event.type) {
    case 'pick':
      return pick(state, event.tool);
    case 'toggleMore':
      return { ...state, more: !state.more };
    case 'view':
      return patched(state, 'view', event.view);
    case 'camera':
      return patched(state, 'camera', event.camera);
    case 'floor':
      return chooseFloor(state, event.floorId, event.empty);
    case 'select':
      return patched(state, 'selected', event.id);
    case 'clear':
      return patched(state, 'selected', null);
  }
}

export type GizmoMode = (typeof GIZMO_MODES)[number];

export type GizmoSpace = (typeof GIZMO_SPACES)[number];

export interface GizmoState {
  readonly mode: GizmoMode;
  readonly space: GizmoSpace;
  readonly snapping: boolean;
  readonly owner: string | null;
}

export type GizmoEvent =
  | { readonly type: 'mode'; readonly mode: GizmoMode; readonly owner: string }
  | { readonly type: 'select'; readonly owner: string | null }
  | { readonly type: 'space' }
  | { readonly type: 'snapping' };

export const GIZMO_START: GizmoState = {
  mode: 'move',
  space: 'local',
  snapping: true,
  owner: null,
};

export function gizmoFor(state: GizmoState, selected: string | null): GizmoState {
  return state.owner === selected ? state : { ...state, mode: 'move', owner: selected };
}

export function reduceGizmo(state: GizmoState, event: GizmoEvent): GizmoState {
  switch (event.type) {
    case 'mode':
      return { ...state, mode: event.mode, owner: event.owner };
    case 'select':
      return gizmoFor(state, event.owner);
    case 'space':
      return { ...state, space: state.space === 'local' ? 'world' : 'local' };
    case 'snapping':
      return { ...state, snapping: !state.snapping };
  }
}

export function shownTool(state: ToolState, readOnly: boolean): EditorTool {
  return toolEnabled(state.tool, readOnly) ? state.tool : 'select';
}

export function floorsByLevel(map: MapFloors): HomeMap['floors'] {
  return [...map.floors].sort((a, b) => a.level - b.level);
}

export function shownFloorId(map: MapFloors, state: ToolState): string | null {
  const floors = floorsByLevel(map);
  const chosen = floors.find((floor) => floor.id === state.floorId);
  return (chosen ?? floors[0])?.id ?? null;
}

export function floorOptions(map: MapFloors): readonly StageFloor[] {
  return floorsByLevel(map).map((floor) => ({ id: floor.id, label: floor.name }));
}

export function floorEmpty(map: MapFloors, floorId: string | null): boolean {
  return map.floors.find((item) => item.id === floorId)?.rooms.length === 0;
}

export function moreSlot(tool: EditorTool): EditorToolInfo | null {
  const info = TOOL_INFO[tool];
  return info.main ? null : info;
}

export function nextFloorLevel(map: MapFloors): number {
  return map.floors.reduce((top, floor) => Math.max(top, floor.level + 1), 0);
}

export function nextFloorName(map: MapFloors): string {
  return `Floor ${String(map.floors.length + 1)}`;
}

export type SaveTone = 'positive' | 'variant' | 'warning' | 'critical';

export interface SaveLine {
  readonly text: string;
  readonly tone: SaveTone;
}

const SAVE_TONE: Readonly<Record<HomeMapSaveStatus['kind'], SaveTone>> = {
  idle: 'positive',
  saved: 'positive',
  saving: 'variant',
  unconfirmed: 'variant',
  conflicts: 'warning',
  not_saved: 'critical',
};

export function saveLine(state: HomeMapEditorState): SaveLine {
  if (!state.connected) return { text: OFFLINE_TEXT, tone: 'warning' };
  return { text: editorNotice(state) ?? 'Saved', tone: SAVE_TONE[state.status.kind] };
}

export interface HistoryButtons {
  readonly undo: boolean;
  readonly redo: boolean;
}

export function historyButtons(state: HomeMapEditorState): HistoryButtons {
  const free = state.connected && state.status.kind !== 'saving';
  return { undo: free && state.canUndo, redo: free && state.canRedo };
}

export const EDITOR_CANVAS_TEXT = 'Map canvas, use the list for exact editing';

export const editorCanvasLabel = (
  floor: Pick<RenderFloor, 'rooms' | 'vacuum'>,
  name: string | null,
): string => `${EDITOR_CANVAS_TEXT}. ${describePlan(floor, name, null, null)}`;

export function acceptedSave(status: HomeMapSaveStatus): boolean {
  return status.kind === 'saved' || status.kind === 'unconfirmed';
}

export type MoveEdit = Extract<EditEvent, { readonly type: 'move' }>;

function objectMove(floor: HomeMapFloor, event: MoveEdit): HomeMapOp {
  return objectOp(floor.id, event.id, {
    at: event.at,
    rotation: event.rotation,
    ...(event.wall === null ? {} : { wall: event.wall }),
    ...(event.elevation === null ? {} : { elevation: event.elevation }),
  });
}

function deviceMove(floor: HomeMapFloor, event: MoveEdit): HomeMapOp {
  const patch = {
    at: event.at,
    rotation: event.rotation,
    ...(event.wall === null ? {} : { wall: event.wall }),
    ...(event.height === null ? {} : { height: event.height }),
    ...(event.mount === null ? {} : { mount: event.mount }),
    auto: false,
  };
  return { op: 'update', kind: 'placement', floorId: floor.id, id: event.id, patch };
}

export function selectMoveOps(floor: HomeMapFloor, event: MoveEdit): readonly HomeMapOp[] {
  if (floor.objects.some((item) => item.id === event.id)) return [objectMove(floor, event)];
  if (floor.placements.some((item) => item.deviceId === event.id)) {
    return [deviceMove(floor, event)];
  }
  return [];
}
