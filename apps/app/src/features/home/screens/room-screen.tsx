import type { ReactNode } from 'react';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { renameRoom } from '../../../api/settings';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { Grid } from '../../../components/grid';
import type { MenuItem } from '../../../components/menu';
import { PageHeader } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { Section } from '../../../components/section';
import { TextEditSheet, type TextEditRequest } from '../../../settings/text-edit-sheet';
import { useDevices, useRoom } from '../../../store/selectors';
import type { TableRow } from '@smarteverything/domain';
import { DeviceTile } from '../../devices';
import { useRoomClimate } from '../components/room-card';
import { RoomScenes } from '../components/room-scenes';
import { useTurnOff } from '../data/turn-off';

type Room = TableRow<'rooms'>;

const ROOM_NAME_LENGTH = 60;

function renameRequest(room: Room): TextEditRequest {
  return {
    title: 'Rename room',
    label: 'Room name',
    initial: room.name,
    placeholder: 'Room name',
    confirmLabel: 'Save',
    maxLength: ROOM_NAME_LENGTH,
    save: (name) => renameRoom(room.id, name),
  };
}

function useOverflow(room: Room, onRename: () => void): readonly MenuItem[] {
  const router = useRouter();
  const turnOff = useTurnOff(room.id);
  return [
    { label: 'Rename room', icon: 'pencil', onPress: onRename },
    {
      label: 'Room settings',
      icon: 'settings',
      onPress: (): void => {
        router.navigate(href.settings.page('home/rooms'));
      },
    },
    ...(turnOff === null ? [] : [turnOff]),
  ];
}

function useClimateLine(roomId: string): string | undefined {
  const climate = useRoomClimate(roomId);
  return climate === '' ? undefined : climate;
}

function RoomBody({ room }: { readonly room: Room }): ReactNode {
  const devices = useDevices({ room: room.id });
  const [renaming, setRenaming] = useState<TextEditRequest | null>(null);
  const overflow = useOverflow(room, () => {
    setRenaming(renameRequest(room));
  });
  const climate = useClimateLine(room.id);
  return (
    <Screen
      header={
        <PageHeader
          title={room.name}
          {...(climate === undefined ? {} : { subtitle: climate })}
          overflow={overflow}
        />
      }
    >
      {devices.length === 0 ? (
        <EmptyState
          icon="grid"
          title="No devices here yet"
          body="Choose a room for a device in its settings."
          action={<Button label="All devices" href={href.devices()} variant="tonal" />}
        />
      ) : (
        <Section title="Devices">
          <Grid minItemWidth={156} maxColumns={6}>
            {devices.map((device) => (
              <DeviceTile key={device.id} device={device} showRoom={false} />
            ))}
          </Grid>
        </Section>
      )}
      <RoomScenes devices={devices} />
      <TextEditSheet
        request={renaming}
        onClose={() => {
          setRenaming(null);
        }}
      />
    </Screen>
  );
}

export function RoomScreen({ roomId }: { readonly roomId: string }): ReactNode {
  const room = useRoom(roomId);
  if (room === null) {
    return (
      <Screen header={<PageHeader title="Room" />} maxWidth="reading">
        <EmptyState
          icon="grid"
          title="This room is gone"
          body="It may have been removed or renamed."
          action={<Button label="Go home" href={href.home()} />}
        />
      </Screen>
    );
  }
  return <RoomBody room={room} />;
}
