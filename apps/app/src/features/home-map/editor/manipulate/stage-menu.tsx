import { useState, type ReactNode } from 'react';
import type { EditEvent, EditHit } from '../../../../components/house-map/3d/map-3d-edit-protocol';
import { useSelectionSurface } from '../docked-panel';
import type { StageLayer } from '../mount-edit';
import type { FurnitureTool } from '../tools/furniture';
import { ObjectContextMenu, type MenuGizmo } from './context-menu';
import type { StageRect, StageSize } from './menu-model';
import { useSelectionActions, type SelectionActions } from './selection-actions';
import { useEditorKeys, type EditorHistory, type Manipulation } from './use-manipulation';

interface StagePoint {
  readonly x: number;
  readonly y: number;
}

export interface MenuAt {
  readonly id: string;
  readonly point: StagePoint;
}

export type PointerEdit = Extract<EditEvent, { readonly type: 'tap' | 'menu' | 'anchor' }>;

export function isPointerEdit(event: EditEvent): event is PointerEdit {
  return event.type === 'tap' || event.type === 'menu' || event.type === 'anchor';
}

export function menuRect(anchor: StageRect | null, at: MenuAt): StageRect {
  return anchor ?? { x: at.point.x, y: at.point.y, width: 0, height: 0 };
}

export function pickHit(
  tool: Pick<FurnitureTool, 'selectedId' | 'select' | 'clear'>,
  hit: EditHit,
): string | null {
  if (hit.kind === 'none') {
    tool.clear();
    return null;
  }
  if (hit.id !== tool.selectedId) tool.select(hit.id);
  return hit.id;
}

export function pickOf(actions: SelectionActions): EditHit {
  if (actions.target.kind === 'object') {
    return { kind: 'object', id: actions.id, locked: actions.target.object.locked };
  }
  return actions.target.kind === 'device'
    ? { kind: 'device', id: actions.id }
    : { kind: 'room', id: actions.id };
}

interface MenuLayerInput {
  readonly actions: SelectionActions;
  readonly manipulation: Manipulation;
  readonly rect: StageRect;
  readonly onClose: () => void;
}

function menuGizmo(manipulation: Manipulation, onClose: () => void): MenuGizmo {
  return {
    mode: manipulation.gizmo.mode,
    modes: manipulation.modes,
    space: manipulation.gizmo.space,
    onMode: (mode): void => {
      onClose();
      manipulation.setMode(mode);
    },
  };
}

function menuLayer({ actions, manipulation, rect, onClose }: MenuLayerInput): StageLayer {
  const gizmo = manipulation.modes.length === 0 ? null : menuGizmo(manipulation, onClose);
  return function SelectMenuLayer(stage: StageSize): ReactNode {
    return (
      <ObjectContextMenu
        title={actions.title}
        gizmo={gizmo}
        locked={manipulation.locked}
        object={rect}
        stage={stage}
        actions={actions.actionsFor('menu')}
        rooms={actions.rooms}
        looks={actions.looks}
        onAction={actions.onAction}
        onRoom={actions.onRoom}
        onLook={actions.onLook}
        onClose={onClose}
      />
    );
  };
}

export interface StageMenu {
  readonly onPointer: (event: PointerEdit) => void;
  readonly layer: StageLayer | null;
}

function pointerHandler(
  tool: FurnitureTool,
  close: () => void,
  openAt: (pick: EditHit, point: StagePoint) => void,
  setAnchor: (rect: StageRect | null) => void,
): (event: PointerEdit) => void {
  return (event): void => {
    if (event.type === 'tap') {
      pickHit(tool, event.hit);
      close();
    } else if (event.type === 'menu') {
      openAt(event.pick, event.point);
    } else {
      setAnchor(event.rect);
    }
  };
}

export function useStageMenu(
  tool: FurnitureTool,
  manipulation: Manipulation,
  keys: boolean,
  history: EditorHistory,
): StageMenu {
  const actions = useSelectionActions(tool);
  const anchored = useSelectionSurface() === 'menu';
  const [anchor, setAnchor] = useState<StageRect | null>(null);
  const [menu, setMenu] = useState<MenuAt | null>(null);
  const open = anchored && actions !== null && menu?.id === actions.id;
  const close = (): void => {
    setMenu(null);
  };
  const openAt = (pick: EditHit, point: StagePoint): void => {
    const id = pickHit(tool, pick);
    setMenu(anchored && id !== null ? { id, point } : null);
  };
  useEditorKeys({
    active: keys && !open,
    manipulation,
    history,
    onClear: tool.clear,
    onSelection:
      actions === null
        ? null
        : (command): void => {
            if (command.kind !== 'menu') actions.onCommand(command);
            else if (anchored && anchor !== null) openAt(pickOf(actions), anchor);
          },
  });
  const onPointer = pointerHandler(tool, close, openAt, setAnchor);
  const layer = open
    ? menuLayer({ actions, manipulation, rect: menuRect(anchor, menu), onClose: close })
    : null;
  return { onPointer, layer };
}
