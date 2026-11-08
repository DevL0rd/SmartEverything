import { use, useReducer } from 'react';
import { ScreenPausedContext } from '../../../../design/screen-pause';
import { background } from '@smarteverything/logging';
import type { EditOverlay } from '../../../../components/house-map/3d/map-3d-edit-protocol';
import { useEscape } from '../../../../components/use-escape';
import type { HomeMapEditing } from '../../data/home-map-query';
import type { EditCommit, EditorNotice } from '../mount-edit';
import {
  GIZMO_START,
  gizmoFor,
  historyButtons,
  reduceGizmo,
  type GizmoMode,
  type GizmoState,
} from '../tool-state';
import type { FurnitureTool } from '../tools/furniture';
import { gizmoEditOps, gizmoModes, handlesOverlay, type GizmoEdit } from './handles-overlay';
import { keyCommand, type GizmoKey, type KeyCommand, type SelectionKey } from './object-actions';
import { selectionTarget } from './pick';
import { useDocumentKeys } from './document-keys';

export type ManipulationTool = Pick<
  FurnitureTool,
  'floor' | 'selectedId' | 'readOnly' | 'specOf' | 'nameOf'
>;

export interface Manipulation {
  readonly gizmo: GizmoState;
  readonly modes: readonly GizmoMode[];
  readonly locked: boolean;
  readonly overlay: EditOverlay;
  readonly notice: EditorNotice | null;
  readonly setMode: (mode: GizmoMode) => void;
  readonly toggleSnapping: () => void;
  readonly toggleSpace: () => void;
  readonly onEdit: (event: GizmoEdit) => void;
}

export const SELECT_KEYS_HINT =
  'Keys: W move, E rotate, R scale, S snapping, X axes, Q turn 90°, F flip, Ctrl+L lock, Delete removes, arrows nudge, Alt drags without snapping, Shift keeps proportions.';

export function useManipulation(tool: ManipulationTool, commit: EditCommit): Manipulation {
  const [state, dispatch] = useReducer(reduceGizmo, GIZMO_START);
  const { floor, selectedId } = tool;
  if (state.owner !== selectedId) dispatch({ type: 'select', owner: selectedId });
  const gizmo = gizmoFor(state, selectedId);
  const target = floor === null ? null : selectionTarget(floor, selectedId);
  const { overlay, notice } = handlesOverlay({ ...tool, gizmo });
  return {
    gizmo,
    modes: tool.readOnly ? [] : gizmoModes(target),
    locked: target?.kind === 'object' && target.object.locked,
    overlay,
    notice,
    setMode: (mode): void => {
      if (selectedId !== null) dispatch({ type: 'mode', mode, owner: selectedId });
    },
    toggleSnapping: (): void => {
      dispatch({ type: 'snapping' });
    },
    toggleSpace: (): void => {
      dispatch({ type: 'space' });
    },
    onEdit: (event): void => {
      commit(event.seq, floor === null ? [] : gizmoEditOps(floor, tool.specOf, event));
    },
  };
}

export type EditorHistory = Pick<HomeMapEditing, 'state' | 'undo' | 'redo'>;

export interface EditorKeys {
  readonly active: boolean;
  readonly manipulation: Manipulation;
  readonly history: EditorHistory;
  readonly onSelection: ((key: SelectionKey) => void) | null;
  readonly onClear: () => void;
}

function gizmoKey(manipulation: Manipulation, key: GizmoKey): boolean {
  if (key.kind === 'snapping') manipulation.toggleSnapping();
  else if (key.kind === 'space') manipulation.toggleSpace();
  else if (manipulation.modes.includes(key.mode)) manipulation.setMode(key.mode);
  else return false;
  return true;
}

function historyKey(history: EditorHistory, kind: 'undo' | 'redo'): boolean {
  if (!historyButtons(history.state)[kind]) return false;
  background(kind === 'undo' ? history.undo() : history.redo(), `home_map.${kind}_failed`);
  return true;
}

export function routeKey(keys: EditorKeys, key: KeyCommand | null): boolean {
  if (key === null) return false;
  if (key.kind === 'undo' || key.kind === 'redo') return historyKey(keys.history, key.kind);
  if (!keys.active || keys.onSelection === null) return false;
  if (key.kind === 'mode' || key.kind === 'snapping' || key.kind === 'space') {
    return gizmoKey(keys.manipulation, key);
  }
  keys.onSelection(key);
  return true;
}

export function useEditorKeys(keys: EditorKeys): void {
  const pause = use(ScreenPausedContext);
  const enabled = useDocumentKeys(true, (press) => routeKey(keys, keyCommand(press)));
  useEscape(enabled && keys.active && keys.onSelection !== null, () => {
    if (!pause.isPaused()) keys.onClear();
  });
}
