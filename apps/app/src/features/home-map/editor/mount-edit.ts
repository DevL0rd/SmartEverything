import type { ReactNode } from 'react';
import type { HomeMapFloor, HomeMapOp } from '@smarteverything/domain';
import type {
  EditEvent,
  EditFloorWire,
  EditOverlay,
} from '../../../components/house-map/3d/map-3d-edit-protocol';
import { boxOf, type SpecOf } from '../../../components/house-map/edit/furniture-box';
import { objectHeight } from '../../../components/house-map/iso/project';
import type { RenderFloor } from '../../../components/house-map/render-scene';
import type { EditFloorFeed } from '../components/stage/home-map-3d';
import type { StageSize } from './manipulate/menu-model';
import type { EditorTool } from './tool-state';

export interface EditorNotice {
  readonly text: string;
  readonly tone: 'info' | 'warning' | 'error';
}

export type StageLayer = (stage: StageSize) => ReactNode;

export interface MountEditFields {
  readonly overlay: EditOverlay | null;
  readonly onEdit: ((event: EditEvent) => void) | null;
  readonly notice: EditorNotice | null;
  readonly draft: boolean;
  readonly layer: StageLayer | null;
}

export const NO_EDIT_FIELDS: MountEditFields = {
  overlay: null,
  onEdit: null,
  notice: null,
  draft: false,
  layer: null,
};

export interface MountArgs {
  readonly floor: RenderFloor;
  readonly name: string;
  readonly placing: boolean;
  readonly tool: EditorTool;
}

export type EditCommit = (seq: number, ops: readonly HomeMapOp[]) => void;

export interface EditFloorInput {
  readonly floor: HomeMapFloor;
  readonly scene: RenderFloor;
  readonly revision: number;
  readonly specOf: SpecOf;
  readonly committed: number | null;
}

function boxesOf(input: EditFloorInput): EditFloorWire['boxes'] {
  const heights = new Map(input.scene.objects.map((item) => [item.id, objectHeight(item)]));
  return Object.fromEntries(
    input.floor.objects.flatMap((object) => {
      const h = heights.get(object.id);
      if (h === undefined) return [];
      const box = boxOf(object, input.specOf);
      return [[object.id, { w: box.w, d: box.d, h }] as const];
    }),
  );
}

function boxesKey(boxes: EditFloorWire['boxes']): string {
  return Object.entries(boxes)
    .map(([id, box]) => `${id}=${String(box.w)}x${String(box.d)}x${String(box.h)}`)
    .join(';');
}

export function editFloorOf(input: EditFloorInput): EditFloorFeed {
  const boxes = boxesOf(input);
  return {
    key: `${input.floor.id}:${String(input.revision)}:${boxesKey(boxes)}`,
    wire: { floor: input.floor, boxes },
    committed: input.committed,
  };
}
