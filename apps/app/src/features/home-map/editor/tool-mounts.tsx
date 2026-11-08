import type { Dispatch, ReactNode } from 'react';
import type { HomeMap, HomeMapActor, HomeMapId } from '@smarteverything/domain';
import type { SpecOf } from '../../../components/house-map/edit/furniture-box';
import type { RenderFloor } from '../../../components/house-map/render-scene';
import type { EditFloorFeed } from '../components/stage/home-map-3d';
import type { HomeMapEditing } from '../data/home-map-query';
import type { ListModeProps } from './list-editor/list-mode';
import { useAlignMount, type MountAlign } from './tools/align-mount';
import { useDeviceRoomFlow } from './tools/device-room-flow';
import { useDevicesMount, type MountDevices } from './tools/devices-mount';
import { useFurnitureMount, type MountFurniture } from './tools/furniture-mount';
import { useMaterialsMount, type MountMaterials } from './tools/materials-mount';
import { useMeasureNotesMount, type MountMeasureNotes } from './tools/measure-notes-mount';
import { useScanAlignMount, type MountScanAlign } from './tools/scan-align-mount';
import { useRoomsMount, type MountRooms } from './tools/rooms-mount';
import { useWallsMount, type MountWalls } from './tools/walls-mount';
import {
  NO_EDIT_FIELDS,
  editFloorOf,
  type EditCommit,
  type MountArgs,
  type MountEditFields,
} from './mount-edit';
import { shownTool, type EditorTool, type ToolEvent, type ToolState } from './tool-state';

export interface Editor {
  readonly map: HomeMap;
  readonly mapId: HomeMapId | undefined;
  readonly actor: HomeMapActor;
  readonly editing: HomeMapEditing;
  readonly tools: ToolState;
  readonly dispatch: Dispatch<ToolEvent>;
  readonly readOnly: boolean;
  readonly floorId: string | null;
}

export interface ToolMount extends MountEditFields {
  readonly panel: ReactNode;
  readonly bar?: ReactNode;
}

export interface EditorMount extends ToolMount {
  readonly editFloor: EditFloorFeed | null;
}

export interface MountSync {
  readonly commit: EditCommit;
  readonly committed: number | null;
}

const NO_MOUNT: ToolMount = { ...NO_EDIT_FIELDS, panel: null };

interface Mounters {
  readonly rooms: MountRooms;
  readonly walls: MountWalls;
  readonly furniture: MountFurniture;
  readonly devices: MountDevices;
  readonly materials: MountMaterials;
  readonly marks: MountMeasureNotes;
  readonly align: MountAlign;
  readonly scan: MountScanAlign;
}

type Mounter = (mounters: Mounters, args: MountArgs) => ToolMount;

export const TOOL_MOUNTS: Readonly<Record<EditorTool, Mounter>> = {
  select: (mounters, args) => mounters.furniture({ ...args, placing: false }),
  rooms: (mounters, args) => mounters.rooms(args),
  walls: (mounters, args) => mounters.walls(args),
  openings: (mounters, args) => mounters.walls(args),
  furniture: (mounters, args) => mounters.furniture(args),
  devices: (mounters, args) => mounters.devices(args),
  materials: (mounters, args) => mounters.materials(args),
  measure: (mounters, args) => mounters.marks(args),
  notes: (mounters, args) => mounters.marks(args),
  align: (mounters, args) => mounters.align(args),
  scan: (mounters, args) => mounters.scan(args),
};

export function useToolMount(
  editor: Editor,
  floor: RenderFloor | undefined,
  sync: MountSync,
): EditorMount {
  const input = {
    ...{ map: editor.map, mapId: editor.mapId, floorId: editor.floorId, editing: editor.editing },
    ...{ readOnly: editor.readOnly, selected: editor.tools.selected },
    onSelect: (id: string): void => {
      editor.dispatch({ type: 'select', id });
    },
  };
  const tool = shownTool(editor.tools, editor.readOnly);
  const rooms = useRoomsMount(input);
  const roomFlow = useDeviceRoomFlow(input);
  const furniture = useFurnitureMount({
    ...input,
    edit: editor.editing.edit,
    roomFlow,
    commit: sync.commit,
    selecting: tool === 'select',
    onClear: (): void => {
      editor.dispatch({ type: 'clear' });
    },
  });
  const devices = useDevicesMount({ ...input, commit: sync.commit }, roomFlow);
  const materials = useMaterialsMount({ ...input, edit: editor.editing.edit });
  const marks = useMeasureNotesMount({ ...input, edit: editor.editing.edit });
  const align = useAlignMount(input);
  const scan = useScanAlignMount({
    ...input,
    ...{ floor, edit: editor.editing.edit, commit: sync.commit },
  });
  const walls = useWallsMount({ ...input, editing: editor.editing, commit: sync.commit });
  const mount =
    floor === undefined
      ? NO_MOUNT
      : TOOL_MOUNTS[tool](
          { rooms, walls, furniture: furniture.mount, devices, materials, marks, align, scan },
          { floor, name: editor.map.name, placing: true, tool },
        );
  return {
    ...mount,
    editFloor:
      mount.overlay === null || floor === undefined
        ? null
        : editFloorFor(editor, floor, furniture.specOf, sync.committed),
  };
}

function editFloorFor(
  editor: Editor,
  scene: RenderFloor,
  specOf: SpecOf,
  committed: number | null,
): EditFloorFeed | null {
  const floor = editor.map.floors.find((item) => item.id === editor.floorId);
  if (floor === undefined) return null;
  return editFloorOf({ floor, scene, revision: editor.map.revision, specOf, committed });
}

export function listModeOf(editor: Editor): ListModeProps {
  return {
    ...{ map: editor.map, floorId: editor.floorId, actor: editor.actor },
    ...{ readOnly: editor.readOnly, edit: editor.editing.edit },
  };
}
