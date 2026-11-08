import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { HomeMapVec, ModelCatalogRow, ModelSpec } from '@smarteverything/domain';
import type { EditEvent } from '../../../../components/house-map/3d/map-3d-edit-protocol';
import type { SpecOf } from '../../../../components/house-map/edit/furniture-box';
import { objectHeight } from '../../../../components/house-map/iso/project';
import type { RenderFloor } from '../../../../components/house-map/render-scene';
import { Button } from '../../../../components/button';
import { Text } from '../../../../components/text';
import { selectionTick } from '../../../../platform/haptics';
import { isGizmoEdit } from '../manipulate/handles-overlay';
import { SelectionBar } from '../manipulate/selection-actions';
import { isPointerEdit, useStageMenu, type StageMenu } from '../manipulate/stage-menu';
import {
  useManipulation,
  type EditorHistory,
  type Manipulation,
} from '../manipulate/use-manipulation';
import {
  NO_EDIT_FIELDS,
  type EditCommit,
  type MountArgs,
  type MountEditFields,
} from '../mount-edit';
import { FurniturePanel, type CatalogueArming } from './catalogue-panel';
import { FlowRow } from './device-tray';
import { useFurnitureTool, type FurnitureInput, type FurnitureTool, type TopAt } from './furniture';
import { armedNotice, pieceFootprint, placeOverlay, supportTop } from './furniture-model';

export interface FurnitureMount extends MountEditFields {
  readonly panel: ReactNode;
  readonly bar: ReactNode;
}

export type MountFurniture = (args: MountArgs) => FurnitureMount;

export interface FurnitureMounter {
  readonly mount: MountFurniture;
  readonly specOf: SpecOf;
  readonly manipulation: Manipulation;
}

export interface FurnitureMountInput extends FurnitureInput {
  readonly commit: EditCommit;
  readonly editing: EditorHistory;
  readonly selecting: boolean;
}

export interface ArmedPiece {
  readonly row: ModelCatalogRow;
  readonly spec: ModelSpec;
}

export const PLACE_MIDDLE_LABEL = 'Place in the middle of the room';

export const CANCEL_PLACING_LABEL = 'Cancel';

export function selectEdit(manipulation: Manipulation, menu: StageMenu, event: EditEvent): void {
  if (isGizmoEdit(event)) {
    manipulation.onEdit(event);
  } else if (isPointerEdit(event)) {
    menu.onPointer(event);
  } else if (event.type === 'pick-up' || (event.type === 'snap' && event.engaged)) {
    selectionTick();
  }
}

function selectBar(tool: FurnitureTool, manipulation: Manipulation): ReactNode {
  return tool.selectedId === null ? null : (
    <>
      <FlowRow tool={tool.roomFlow} />
      <SelectionBar tool={tool} manipulation={manipulation} />
    </>
  );
}

export function topAtOf(tool: FurnitureTool, scene: RenderFloor): TopAt {
  const heights = new Map(scene.objects.map((item) => [item.id, objectHeight(item)]));
  return (point: HomeMapVec): number =>
    tool.floor === null
      ? 0
      : supportTop(tool.floor, (id) => heights.get(id) ?? null, point, tool.specOf);
}

export function armedOf(
  tool: FurnitureTool,
  armed: ArmedPiece | null,
  placing: boolean,
): ArmedPiece | null {
  return placing && !tool.readOnly && tool.selected === null ? armed : null;
}

export interface Placing {
  readonly tool: FurnitureTool;
  readonly piece: ArmedPiece;
  readonly topAt: TopAt;
  readonly disarm: () => void;
}

export function placeEdit(placing: Placing, event: EditEvent): void {
  if (event.type !== 'place') return;
  const { tool, piece, topAt } = placing;
  if (tool.place({ ...piece, at: event.at, rotation: event.rotation, topAt })) placing.disarm();
}

export function placeMiddle(placing: Placing): void {
  const { tool, piece, topAt } = placing;
  if (tool.place({ ...piece, at: null, rotation: 0, topAt })) placing.disarm();
}

function ArmedCard({ placing }: { readonly placing: Placing }): ReactNode {
  return (
    <View
      accessibilityLiveRegion="polite"
      className="gap-2 rounded-md border-2 border-primary bg-primary-container p-3"
    >
      <Text variant="body-strong" tone="onPrimaryContainer" numberOfLines={2}>
        {placing.piece.row.title}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        <Button
          label={PLACE_MIDDLE_LABEL}
          icon="move"
          variant="tonal"
          onPress={(): void => {
            placeMiddle(placing);
          }}
        />
        <Button label={CANCEL_PLACING_LABEL} variant="text" onPress={placing.disarm} />
      </View>
    </View>
  );
}

function armedFields(placing: Placing, manipulation: Manipulation): MountEditFields {
  const { piece } = placing;
  return {
    ...NO_EDIT_FIELDS,
    overlay: placeOverlay(manipulation.overlay, pieceFootprint(piece.row.id, piece.spec)),
    notice: { text: armedNotice(piece.row.title), tone: 'info' },
    onEdit: (event): void => {
      placeEdit(placing, event);
    },
  };
}

function selectFields(manipulation: Manipulation, menu: StageMenu): MountEditFields {
  return {
    ...NO_EDIT_FIELDS,
    overlay: manipulation.overlay,
    notice: manipulation.notice,
    layer: menu.layer,
    onEdit: (event): void => {
      selectEdit(manipulation, menu, event);
    },
  };
}

export function mountFields(
  held: Placing | null,
  manipulation: Manipulation,
  menu: StageMenu,
): MountEditFields {
  return held === null ? selectFields(manipulation, menu) : armedFields(held, manipulation);
}

interface PanelInput {
  readonly tool: FurnitureTool;
  readonly manipulation: Manipulation;
  readonly held: Placing | null;
  readonly catalogue: CatalogueArming | null;
}

function panelOf({ tool, manipulation, held, catalogue }: PanelInput): ReactNode {
  return (
    <>
      <FlowRow tool={tool.roomFlow} />
      {held === null ? null : <ArmedCard placing={held} />}
      <FurniturePanel tool={tool} manipulation={manipulation} catalogue={catalogue} />
    </>
  );
}

export function useFurnitureMount(input: FurnitureMountInput): FurnitureMounter {
  const tool = useFurnitureTool(input);
  const manipulation = useManipulation(tool, input.commit);
  const menu = useStageMenu(tool, manipulation, input.selecting, input.editing);
  const [armed, setArmed] = useState<ArmedPiece | null>(null);
  const disarm = (): void => {
    setArmed(null);
  };
  const mount: MountFurniture = ({ placing, floor }) => {
    const piece = armedOf(tool, armed, placing);
    const held = piece === null ? null : { tool, piece, topAt: topAtOf(tool, floor), disarm };
    const catalogue: CatalogueArming = {
      armed: piece?.row.id ?? null,
      onArm: (row, spec): void => {
        setArmed(piece?.row.id === row.id ? null : { row, spec });
      },
    };
    return {
      ...mountFields(held, manipulation, menu),
      panel: panelOf({ tool, manipulation, held, catalogue: placing ? catalogue : null }),
      bar: selectBar(tool, manipulation),
    };
  };
  return { mount, specOf: tool.specOf, manipulation };
}
