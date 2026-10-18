import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { TableRow } from '@smarteverything/domain';
import { removeRoom } from '../../../api/settings';
import { confirm } from '../../../components/confirm-store';
import { EmptyState } from '../../../components/empty-state';
import { ListRow } from '../../../components/list-row';
import { OverflowButton, type MenuItem } from '../../../components/menu';
import { Icon } from '../../../components/icon';
import { ReorderableList } from '../../../components/reorderable-list';
import { Section } from '../../../components/section';
import { notifyFailure } from '../../../components/toast-store';
import { useValue } from '../../../design/external-store';
import { plural } from '../../../format/text';
import { useDevices, useRooms } from '../../../store/selectors';
import { TextEditSheet } from '../../../settings/text-edit-sheet';
import { orderedRooms } from '../../../store/table-rules';
import { moveRoom, openRenameRoom, reorderRooms, roomEditor } from './rooms';

import { trackSetting } from '../settings-log';
type Room = TableRow<'rooms'>;

function deviceCounts(
  devices: readonly { readonly room_id: string | null }[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const device of devices) {
    if (device.room_id !== null) {
      counts.set(device.room_id, (counts.get(device.room_id) ?? 0) + 1);
    }
  }
  return counts;
}

async function deleteRoom(room: Room, devices: number): Promise<void> {
  const accepted = await confirm({
    title: `Delete ${room.name}?`,
    body:
      devices === 0
        ? 'This room has no devices.'
        : `Its ${plural(devices, 'device')} will have no room.`,
    confirmLabel: 'Delete',
    tone: 'destructive',
  });
  if (accepted) {
    await trackSetting('room.delete', { roomId: room.id, devices }, () => removeRoom(room.id));
  }
}

function itemsFor(
  room: Room,
  rooms: readonly Room[],
  index: number,
  devices: number,
): readonly MenuItem[] {
  return [
    {
      label: 'Rename',
      icon: 'pencil',
      onPress: (): void => {
        openRenameRoom(room);
      },
    },
    {
      label: 'Move up',
      icon: 'chevronUp',
      disabled: index === 0,
      onPress: (): void => {
        moveRoom(rooms, room.id, -1).catch(notifyFailure('The room was not moved'));
      },
    },
    {
      label: 'Move down',
      icon: 'chevronDown',
      disabled: index === rooms.length - 1,
      onPress: (): void => {
        moveRoom(rooms, room.id, 1).catch(notifyFailure('The room was not moved'));
      },
    },
    {
      label: 'Delete',
      icon: 'trash',
      destructive: true,
      onPress: (): void => {
        deleteRoom(room, devices).catch(notifyFailure('The room was not deleted'));
      },
    },
  ];
}

function RoomRow({
  room,
  rooms,
  index,
  devices,
}: {
  readonly room: Room;
  readonly rooms: readonly Room[];
  readonly index: number;
  readonly devices: number;
}): ReactNode {
  return (
    <ListRow
      title={room.name}
      subtitle={devices === 0 ? 'No devices' : plural(devices, 'device')}
      icon="sofa"
      trailing={
        <View className="flex-row items-center">
          <Icon name="grip" tone="faint" />
          <OverflowButton
            items={itemsFor(room, rooms, index, devices)}
            label={`${room.name} actions`}
          />
        </View>
      }
    />
  );
}

export function RoomsBlock(): ReactNode {
  const rooms = orderedRooms(useRooms());
  const devices = useDevices({ includeHidden: true });
  const counts = deviceCounts(devices);
  const indexes = new Map(rooms.map((room, index) => [room.id, index]));
  const request = useValue(roomEditor);
  const sheet = (
    <TextEditSheet
      request={request}
      onClose={() => {
        roomEditor.set(null);
      }}
    />
  );
  if (rooms.length === 0) {
    return (
      <>
        <EmptyState
          icon="sofa"
          title="No rooms yet"
          body="Rooms group your devices on Home and in Climate."
        />
        {sheet}
      </>
    );
  }
  return (
    <>
      <Section footer="Drag to reorder. Rooms appear in this order everywhere in the app.">
        <ReorderableList
          items={rooms}
          keyOf={(room) => room.id}
          labelOf={(room) => room.name}
          renderItem={(room) => (
            <RoomRow
              room={room}
              rooms={rooms}
              index={indexes.get(room.id) ?? 0}
              devices={counts.get(room.id) ?? 0}
            />
          )}
          onReorder={(keys) => {
            reorderRooms(rooms, keys).catch(notifyFailure('The rooms were not reordered'));
          }}
        />
      </Section>
      {sheet}
    </>
  );
}
