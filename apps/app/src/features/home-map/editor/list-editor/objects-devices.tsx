import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type {
  HomeMap,
  HomeMapActor,
  HomeMapFloor,
  HomeMapOp,
  TableRow,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Icon } from '../../../../components/icon';
import { Text } from '../../../../components/text';
import { compareText } from '../../../../format/text';
import { useRooms } from '../../../../store/selectors';
import { usePlacingDevices } from '../tools/placing-devices';
import { PlacedDeviceItem, UnplacedDeviceRow } from './device-item';
import { ListSection } from './list-parts';
import { ObjectItem } from './object-item';
import {
  deviceGroups,
  deviceRoomGroups,
  objectTitle,
  placeAutomatically,
  type DeviceGroups,
  type ItemsContext,
} from './objects-devices-model';
import { checkedOps, NOT_APPLIED_TEXT, roomTitle } from './rooms-walls-model';

export const OBJECTS_DEVICES_LABEL = 'Furniture and devices as a list';

export interface ObjectsDevicesListProps {
  readonly map: HomeMap;
  readonly floor: HomeMapFloor;
  readonly actor: HomeMapActor;
  readonly readOnly: boolean;
  readonly send: (ops: readonly HomeMapOp[]) => void;
}

interface OpenState {
  readonly openId: string | null;
  readonly onOpen: (id: string | null) => void;
}

function toggle(open: OpenState, id: string): () => void {
  return (): void => {
    open.onOpen(open.openId === id ? null : id);
  };
}

function Objects({
  context,
  open,
}: {
  readonly context: ItemsContext;
  readonly open: OpenState;
}): ReactNode {
  const objects = [...context.floor.objects].sort((a, b) =>
    compareText(objectTitle(a), objectTitle(b)),
  );
  return (
    <View className="gap-2">
      <View className="min-h-touch-min flex-row items-center gap-2">
        <Icon name="sofa" size={20} tone="variant" />
        <Text variant="body-strong" accessibilityRole="header" className="min-w-0 flex-1">
          {`Furniture and objects · ${String(objects.length)}`}
        </Text>
      </View>
      {objects.map((object) => (
        <ObjectItem
          key={object.id}
          context={context}
          object={object}
          open={open.openId === object.id}
          onToggle={toggle(open, object.id)}
        />
      ))}
    </View>
  );
}

function Devices({
  context,
  groups,
  rooms,
  open,
}: {
  readonly context: ItemsContext;
  readonly groups: DeviceGroups;
  readonly rooms: readonly TableRow<'rooms'>[];
  readonly open: OpenState;
}): ReactNode {
  const ready = groups.unplaced.filter(({ onMap }) => onMap).map(({ device }) => device.id);
  return (
    <ListSection
      title="Devices"
      icon="plug"
      count={groups.placed.length}
      addLabel="Place all automatically"
      disabled={context.readOnly || ready.length === 0}
      onAdd={(): void => {
        context.place(ready);
      }}
    >
      {deviceRoomGroups(groups, rooms).map((group) => (
        <View key={group.key} className="gap-2">
          <Text variant="footnote" tone="variant" accessibilityRole="header" className="pt-2">
            {`${group.title} · ${String(group.devices.length)}`}
          </Text>
          {group.devices.map((entry) =>
            entry.kind === 'placed' ? (
              <PlacedDeviceItem
                key={entry.device.id}
                context={context}
                entry={entry}
                open={open.openId === entry.device.id}
                onToggle={toggle(open, entry.device.id)}
              />
            ) : (
              <UnplacedDeviceRow key={entry.device.id} context={context} entry={entry} />
            ),
          )}
        </View>
      ))}
    </ListSection>
  );
}

function useItemsContext(
  props: ObjectsDevicesListProps,
  hubRooms: readonly TableRow<'rooms'>[],
): { readonly context: ItemsContext; readonly notice: string | null } {
  const [notice, setNotice] = useState<string | null>(null);
  const context: ItemsContext = {
    floor: props.floor,
    rooms: props.floor.rooms.map((room, index) => ({
      room,
      title: roomTitle(room, hubRooms, index),
    })),
    readOnly: props.readOnly,
    apply: (ops): void => {
      const checked = checkedOps(props.map, ops, props.actor);
      setNotice(checked === null ? NOT_APPLIED_TEXT : null);
      if (checked !== null) props.send(checked);
    },
    place: (deviceIds): void => {
      setNotice(null);
      background(placeAutomatically(props.map, deviceIds).then(setNotice), 'home_map.list_place', {
        asked: deviceIds.length,
      });
    },
  };
  return { context, notice };
}

export function ObjectsDevicesList(props: ObjectsDevicesListProps): ReactNode {
  const hubRooms = useRooms();
  const devices = usePlacingDevices();
  const { context, notice } = useItemsContext(props, hubRooms);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = { openId, onOpen: setOpenId };
  return (
    <View accessibilityLabel={OBJECTS_DEVICES_LABEL} className="gap-4">
      {notice === null ? null : (
        <Text variant="footnote" tone="warning" accessibilityLiveRegion="polite">
          {notice}
        </Text>
      )}
      <Objects context={context} open={open} />
      <Devices
        context={context}
        groups={deviceGroups(props.map, props.floor, devices)}
        rooms={hubRooms}
        open={open}
      />
    </View>
  );
}
