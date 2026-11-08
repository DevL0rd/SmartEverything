import { randomUUID } from 'expo-crypto';
import { useReducer, type ReactNode } from 'react';
import type { HomeMap, HomeMapOp } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { EditEvent } from '../../../../components/house-map/3d/map-3d-edit-protocol';
import { MeasureNotesPanel } from './measure-notes';
import {
  INITIAL_MEASURE_NOTES,
  marksNotice,
  marksOverlay,
  measureNotesTap,
  reduceMeasureNotes,
  type MeasureNotesContext,
  type MeasureNotesMode,
} from './measure-notes-model';
import { NO_EDIT_FIELDS, type MountArgs, type MountEditFields } from '../mount-edit';

export interface MeasureNotesInput {
  readonly map: HomeMap;
  readonly floorId: string | null;
  readonly readOnly: boolean;
  readonly edit: (ops: readonly HomeMapOp[]) => Promise<unknown>;
}

export interface MeasureNotesMount extends MountEditFields {
  readonly panel: ReactNode;
}

export type MountMeasureNotes = (args: MountArgs) => MeasureNotesMount;

const SNAP = { fine: false, free: false } as const;

export function marksEdit(context: MeasureNotesContext, event: EditEvent): void {
  if (event.type === 'tap') measureNotesTap(context, event.point, SNAP);
}

export function useMeasureNotesMount(input: MeasureNotesInput): MountMeasureNotes {
  const [state, dispatch] = useReducer(reduceMeasureNotes, INITIAL_MEASURE_NOTES);
  const mapFloor = input.map.floors.find((item) => item.id === input.floorId);
  return ({ tool }) => {
    if (mapFloor === undefined) return { ...NO_EDIT_FIELDS, panel: null };
    const mode: MeasureNotesMode = tool === 'notes' ? 'notes' : 'measure';
    const context: MeasureNotesContext = {
      ...{ mode, floor: mapFloor, state, dispatch, readOnly: input.readOnly },
      newId: (): string => randomUUID(),
      edit: (ops): void => {
        background(input.edit(ops), 'home_map.marks_edit_failed');
      },
    };
    return {
      ...NO_EDIT_FIELDS,
      overlay: marksOverlay(context),
      onEdit: (event): void => {
        marksEdit(context, event);
      },
      notice: marksNotice(context),
      draft: mode === 'measure' && state.from !== null,
      panel: <MeasureNotesPanel context={context} />,
    };
  };
}
