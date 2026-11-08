import { randomUUID } from 'expo-crypto';
import type { ReactNode } from 'react';
import {
  homeMapRoomAt,
  type HomeMapFloor,
  type HomeMapObject,
  type HomeMapRoom,
  type ModelSpec,
} from '@smarteverything/domain';
import { useDevices, useRooms } from '../../../../store/selectors';
import { objectEditFacts } from '../inspector/object-edit-model';
import { OUTSIDE_TEXT } from '../list-editor/objects-devices-model';
import { roomTitle } from '../list-editor/rooms-walls-model';
import type { FurnitureTool } from '../tools/furniture';
import { ContextualBar, type BarGizmo } from './contextual-bar';
import { selectionTarget } from './pick';
import type { SubChoice, SubmenuId } from './menu-model';
import {
  commandOutcome,
  lookOps,
  moveToRoom,
  objectActions,
  runAction,
  type ActionOutcome,
  type ActionScene,
  type ActionTarget,
  type ActionSurface,
  type SelectionCommand,
  type LookChoice,
  type ObjectAction,
  type ObjectActionId,
} from './object-actions';
import type { Manipulation } from './use-manipulation';

export interface SelectionActions {
  readonly id: string;
  readonly target: ActionTarget;
  readonly title: string;
  readonly room: string;
  readonly rooms: readonly SubChoice[];
  readonly looks: readonly SubChoice[];
  readonly actionsFor: (surface: ActionSurface) => readonly ObjectAction[];
  readonly onAction: (id: Exclude<ObjectActionId, SubmenuId>) => void;
  readonly onRoom: (key: string) => void;
  readonly onLook: (key: string) => void;
  readonly onCommand: (command: SelectionCommand) => void;
}

export function lookChoices(
  object: HomeMapObject,
  spec: ModelSpec | undefined,
): readonly LookChoice[] {
  if (spec === undefined) return [];
  const facts = objectEditFacts(spec);
  const finish = object.finish ?? facts.defaultFinish;
  const style = object.style ?? facts.defaultStyle;
  return [
    ...facts.styles.map((item): LookChoice => ({
      kind: 'style',
      value: item.name,
      label: item.label,
      on: item.name === style,
    })),
    ...facts.finishes.map((item): LookChoice => ({
      kind: 'finish',
      value: item.name,
      label: item.label,
      on: item.name === finish,
    })),
  ];
}

export function lookKey(look: LookChoice): string {
  return `${look.kind}:${look.value}`;
}

export function applyOutcome(tool: FurnitureTool, outcome: ActionOutcome): void {
  if (outcome.kind === 'blocked') {
    tool.notify(outcome.notice);
    return;
  }
  tool.notify(null);
  if (outcome.kind === 'placeDevice') {
    tool.roomFlow.place(outcome.deviceId, outcome.at, 'move');
    return;
  }
  if (outcome.ops.length > 0) tool.send(outcome.ops);
  if (outcome.select === null) tool.clear();
  else if (outcome.select !== tool.selectedId) tool.select(outcome.select);
}

const UNNAMED_DEVICE = 'Device';

function targetId(target: ActionTarget): string {
  if (target.kind === 'object') return target.object.id;
  return target.kind === 'device' ? target.placement.deviceId : target.room.id;
}

function atOf(target: ActionTarget): HomeMapObject['at'] | null {
  if (target.kind === 'object') return target.object.at;
  return target.kind === 'device' ? target.placement.at : null;
}

interface LabelInput {
  readonly target: ActionTarget;
  readonly floor: HomeMapFloor;
  readonly here: HomeMapRoom | null;
  readonly hubRooms: ReturnType<typeof useRooms>;
  readonly devices: ReturnType<typeof useDevices>;
  readonly nameOf: (id: string) => string;
}

function labelsOf(input: LabelInput): { readonly title: string; readonly room: string } {
  const { target, floor, here, hubRooms } = input;
  const roomName = (room: HomeMapRoom): string =>
    roomTitle(room, hubRooms, floor.rooms.indexOf(room));
  if (target.kind === 'room') return { title: roomName(target.room), room: floor.name };
  const room = here === null ? OUTSIDE_TEXT : roomName(here);
  if (target.kind === 'object') return { title: input.nameOf(target.object.id), room };
  const { deviceId } = target.placement;
  const device = input.devices.find((item) => item.id === deviceId);
  return { title: device?.label ?? UNNAMED_DEVICE, room };
}

export function useSelectionActions(tool: FurnitureTool): SelectionActions | null {
  const hubRooms = useRooms();
  const devices = useDevices();
  const { floor } = tool;
  const target = floor === null ? null : selectionTarget(floor, tool.selectedId);
  if (floor === null || target === null) return null;
  const scene: ActionScene = {
    floor,
    specOf: tool.specOf,
    newId: () => randomUUID(),
  };
  const id = targetId(target);
  const at = atOf(target);
  const here = at === null ? null : homeMapRoomAt(floor.rooms, at);
  const looks =
    target.kind === 'object' ? lookChoices(target.object, tool.specOf(target.object.modelId)) : [];
  const done = (outcome: ActionOutcome): void => {
    applyOutcome(tool, outcome);
  };
  return {
    id,
    target,
    ...labelsOf({ target, floor, here, hubRooms, devices, nameOf: tool.nameOf }),
    rooms: floor.rooms.map((room, index) => ({
      key: room.id,
      label: roomTitle(room, hubRooms, index),
      on: room.id === here?.id,
    })),
    looks: looks.map((look) => ({ key: lookKey(look), label: look.label, on: look.on })),
    actionsFor: (surface) => objectActions(target, surface, tool.readOnly),
    onAction: (action): void => {
      done(runAction(scene, target, action));
    },
    onRoom: (key): void => {
      done(moveToRoom(scene, target, key));
    },
    onLook: (key): void => {
      const look = looks.find((item) => lookKey(item) === key);
      if (look !== undefined && target.kind === 'object') {
        done(lookOps(floor.id, target.object, look));
      }
    },
    onCommand: (command): void => {
      done(commandOutcome(scene, target, command));
    },
  };
}

export function barGizmo(manipulation: Manipulation): BarGizmo {
  return {
    mode: manipulation.gizmo.mode,
    modes: manipulation.modes,
    space: manipulation.gizmo.space,
    snapping: manipulation.gizmo.snapping,
    disabled: manipulation.modes.length === 0,
    onMode: manipulation.setMode,
    onSnapping: manipulation.toggleSnapping,
    onSpace: manipulation.toggleSpace,
  };
}

export interface SelectionBarProps {
  readonly tool: FurnitureTool;
  readonly manipulation: Manipulation;
}

export function SelectionBar({ tool, manipulation }: SelectionBarProps): ReactNode {
  const actions = useSelectionActions(tool);
  if (actions === null) return null;
  return (
    <ContextualBar
      title={actions.title}
      locked={manipulation.locked}
      gizmo={barGizmo(manipulation)}
      actions={actions.actionsFor('bar')}
      rooms={actions.rooms}
      looks={actions.looks}
      onAction={actions.onAction}
      onRoom={actions.onRoom}
      onLook={actions.onLook}
      onClear={tool.clear}
    />
  );
}
