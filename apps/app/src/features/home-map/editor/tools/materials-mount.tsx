import { useState, type ReactNode } from 'react';
import type { HomeMap, HomeMapOp } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { EditEvent } from '../../../../components/house-map/3d/map-3d-edit-protocol';
import { MaterialsPanel } from './materials';
import {
  INITIAL_FINISH,
  finishNotice,
  finishOverlay,
  paintOps,
  paintedRoom,
  type FinishPick,
} from './materials-model';
import { NO_EDIT_FIELDS, type MountArgs, type MountEditFields } from '../mount-edit';

export interface MaterialsInput {
  readonly map: HomeMap;
  readonly floorId: string | null;
  readonly selected: string | null;
  readonly readOnly: boolean;
  readonly edit: (ops: readonly HomeMapOp[]) => Promise<unknown>;
  readonly onSelect: (id: string) => void;
}

export interface MaterialsMount extends MountEditFields {
  readonly panel: ReactNode;
}

export type MountMaterials = (args: MountArgs) => MaterialsMount;

export function materialsEdit(input: MaterialsInput, pick: FinishPick, event: EditEvent): void {
  const floor = input.map.floors.find((item) => item.id === input.floorId);
  if (floor === undefined) return;
  if (event.type === 'tap') {
    if (event.hit.kind === 'room') input.onSelect(event.hit.id);
    return;
  }
  if (event.type !== 'paint' || input.readOnly) return;
  const room = paintedRoom(floor, event.target);
  if (room === null) return;
  const ops = paintOps(floor.id, room, pick, event.target);
  if (ops.length > 0) background(input.edit(ops), 'home_map.paint_failed');
  input.onSelect(room.id);
}

export function useMaterialsMount(input: MaterialsInput): MountMaterials {
  const [pick, setPick] = useState<FinishPick>(INITIAL_FINISH);
  return () => ({
    ...NO_EDIT_FIELDS,
    overlay: finishOverlay(pick, input.selected, input.readOnly),
    onEdit: (event): void => {
      materialsEdit(input, pick, event);
    },
    notice: finishNotice(pick),
    panel: (
      <MaterialsPanel
        map={input.map}
        floorId={input.floorId}
        selectedId={input.selected}
        readOnly={input.readOnly}
        pick={pick}
        onPick={setPick}
        edit={input.edit}
      />
    ),
  });
}
