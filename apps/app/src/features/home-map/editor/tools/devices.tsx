import { useState, type ReactNode } from 'react';
import type { HomeMap, HomeMapFloor, HomeMapOp, HomeMapPlacement } from '@smarteverything/domain';
import type { EditEvent } from '../../../../components/house-map/3d/map-3d-edit-protocol';
import { selectionTick } from '../../../../platform/haptics';
import { useDevices, useRooms } from '../../../../store/selectors';
import type { Device } from '../../../../store/state';
import {
  modelSubjectOf,
  resolvedModelOf,
  useDeviceModel,
  useModelCatalog,
  useModelOverrides,
} from '../../../models';
import { placementOp } from '../list-editor/objects-devices-model';
import type { EditCommit } from '../mount-edit';
import type { MoveEdit } from '../tool-state';
import { placeableIds, type PickerRoom } from './device-picker-model';
import type { DeviceRoomFlow, RoomFlowRow } from './device-room-flow';
import {
  CALM,
  armedOf,
  movedPlacement,
  placeAll,
  placementOfDevice,
  settledPlacement,
  spotPlacement,
  tappedId,
  type ArmedDevice,
  type DevicesInput,
  type PlaceEdit,
  type TapEdit,
} from './devices-model';
import { WallSection, wallSpotFor } from './wall-object-inspector';

export interface DevicesTool extends RoomFlowRow {
  readonly map: HomeMap;
  readonly floor: HomeMapFloor | null;
  readonly devices: readonly Device[];
  readonly rooms: readonly PickerRoom[];
  readonly selected: string | null;
  readonly armed: ArmedDevice | null;
  readonly select: (id: string) => void;
  readonly moveTo: DeviceRoomFlow['moveTo'];
  readonly arm: (device: Device | null) => void;
  readonly apply: (ops: readonly HomeMapOp[]) => void;
  readonly placeAll: () => void;
  readonly onEdit: (event: EditEvent) => void;
}

export interface DevicesToolInput extends DevicesInput {
  readonly commit: EditCommit;
}

interface EditContext {
  readonly input: DevicesToolInput;
  readonly flow: DeviceRoomFlow;
  readonly floor: HomeMapFloor;
  readonly devices: readonly Device[];
  readonly rooms: readonly PickerRoom[];
  readonly armed: ArmedDevice | null;
  readonly disarm: () => void;
}

function settle(
  context: EditContext,
  seq: number,
  base: HomeMapPlacement | null,
  next: HomeMapPlacement,
): void {
  const device = context.devices.find((each) => each.id === next.deviceId);
  const { floor, rooms, flow, input } = context;
  const settled = settledPlacement({ floor, device, base, next, rooms });
  input.onSelect(next.deviceId);
  if (settled.kind === 'apply') {
    input.commit(seq, settled.ops);
    return;
  }
  input.commit(seq, []);
  flow.show({ ...CALM, pending: settled.move });
}

function onPlace(context: EditContext, event: PlaceEdit): void {
  const { armed, input, floor } = context;
  if (armed === null) return;
  context.disarm();
  const base = placementOfDevice(input.map, armed.deviceId);
  settle(context, event.seq, base, spotPlacement(floor, armed, base, event));
}

function onMove(context: EditContext, event: MoveEdit): void {
  const base = context.floor.placements.find((each) => each.deviceId === event.id);
  if (base === undefined) {
    context.input.commit(event.seq, []);
    return;
  }
  settle(context, event.seq, base, movedPlacement(base, event));
}

function onTap(context: EditContext, event: TapEdit): void {
  const id = tappedId(context.floor, event);
  if (id === null) return;
  selectionTick();
  context.input.onSelect(id);
}

function onDevicesEdit(context: EditContext, event: EditEvent): void {
  if (event.type === 'tap') {
    onTap(context, event);
    return;
  }
  if (context.input.readOnly) return;
  if (event.type === 'place') onPlace(context, event);
  else if (event.type === 'move') onMove(context, event);
  else if (event.type === 'pick-up' || (event.type === 'snap' && event.engaged)) selectionTick();
}

export function useDevicesTool(input: DevicesToolInput, flow: DeviceRoomFlow): DevicesTool {
  const devices = useDevices();
  const rooms = useRooms();
  const catalog = useModelCatalog();
  const overrides = useModelOverrides();
  const floor = input.map.floors.find((each) => each.id === input.floorId) ?? null;
  const [armed, setArmed] = useState<ArmedDevice | null>(null);
  const disarm = (): void => {
    setArmed(null);
  };
  const arm = (device: Device | null): void => {
    if (device === null) {
      disarm();
      return;
    }
    const main = resolvedModelOf(modelSubjectOf(device), catalog, overrides).resolution.main;
    setArmed(armedOf(device, placementOfDevice(input.map, device.id), main));
  };
  const { pending, moved, note, readOnly, confirmMove, keep, undoMove, dismiss, apply } = flow;
  return {
    ...{ map: input.map, floor, devices, rooms, selected: input.selected },
    ...{ pending, moved, note, readOnly, confirmMove, keep, undoMove, dismiss, apply },
    ...{ armed, select: input.onSelect, arm },
    moveTo: flow.moveTo,
    placeAll: (): void => {
      flow.run(placeAll(input.map, placeableIds(input.map, devices)), 'home_map.place_all_failed');
    },
    onEdit: (event): void => {
      if (floor === null) return;
      onDevicesEdit({ input, flow, floor, devices, rooms, armed, disarm }, event);
    },
  };
}

export interface DeviceWallSectionProps {
  readonly tool: Pick<DevicesTool, 'floor' | 'rooms' | 'readOnly' | 'apply'>;
  readonly device: Device;
  readonly placement: HomeMapPlacement;
}

export function DeviceWallSection({ tool, device, placement }: DeviceWallSectionProps): ReactNode {
  const model = useDeviceModel(device);
  const { floor } = tool;
  if (floor === null || placement.mount !== 'wall') return null;
  const footprint = model.spec.status === 'ready' ? model.spec.value.footprint : null;
  const size = { width: 0, depth: 0 };
  const patch = (next: Partial<HomeMapPlacement>): void => {
    tool.apply([placementOp(placement.floorId, device.id, next)]);
  };
  return (
    <WallSection
      floor={floor}
      attachment={placement.wall}
      heightM={placement.height}
      size={{ ...size, depth: footprint?.depth ?? 0, tall: footprint?.height ?? 0 }}
      hubRooms={tool.rooms}
      disabled={tool.readOnly}
      onHeight={(height): void => {
        patch({ height });
      }}
      onAttach={(change): void => {
        const spot = wallSpotFor(floor, placement, change, size);
        if (spot !== null) patch(spot);
      }}
    />
  );
}
