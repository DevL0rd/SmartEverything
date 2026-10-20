import type { ReactNode } from 'react';
import { useState } from 'react';
import type { DeviceScope } from '@smarteverything/domain';
import { Segmented } from '../../../components/segmented';
import { SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { notifyFailure } from '../../../components/toast-store';
import { useListedDevices, useRooms } from '../../../store/selectors';
import { scopesChange, toggled } from '../model/scopes';
import { EditorSheet, type EditorProps } from './editor-sheet';

type Mode = DeviceScope['mode'];

const MODES = [
  { value: 'all', label: 'All' },
  { value: 'only', label: 'Only these' },
  { value: 'except', label: 'All except' },
] as const;

const MODE_HELP: Readonly<Record<Mode, string>> = {
  all: 'This person sees and controls every device.',
  only: 'This person sees and controls only the rooms and devices ticked below.',
  except: 'This person sees and controls everything except the rooms and devices ticked below.',
};

function Picks({
  rooms,
  devices,
  onRoom,
  onDevice,
}: {
  readonly rooms: readonly string[];
  readonly devices: readonly string[];
  readonly onRoom: (id: string) => void;
  readonly onDevice: (id: string) => void;
}): ReactNode {
  const allRooms = useRooms();
  const allDevices = useListedDevices();
  return (
    <>
      <List title="Rooms">
        {allRooms.map((room) => (
          <SwitchRow
            key={room.id}
            title={room.name}
            value={rooms.includes(room.id)}
            onChange={() => {
              onRoom(room.id);
            }}
          />
        ))}
      </List>
      <List title="Devices">
        {allDevices.map((device) => (
          <SwitchRow
            key={device.id}
            title={device.label}
            value={devices.includes(device.id)}
            onChange={() => {
              onDevice(device.id);
            }}
          />
        ))}
      </List>
    </>
  );
}

export function DevicesScopeSheet({ access, actions, onClose }: EditorProps): ReactNode {
  const [mode, setMode] = useState<Mode>(access.scopes.devices.mode);
  const [rooms, setRooms] = useState<readonly string[]>(access.scopes.devices.rooms);
  const [devices, setDevices] = useState<readonly string[]>(access.scopes.devices.devices);
  return (
    <EditorSheet
      title="Devices and rooms"
      intro={MODE_HELP[mode]}
      onClose={onClose}
      onSave={() => {
        actions
          .change(
            access.profile_id,
            scopesChange(access, { devices: { mode, rooms: [...rooms], devices: [...devices] } }),
          )
          .catch(notifyFailure('The devices were not saved'));
      }}
    >
      <Segmented<Mode> fill label="Which devices" options={MODES} value={mode} onChange={setMode} />
      {mode === 'all' ? null : (
        <Picks
          rooms={rooms}
          devices={devices}
          onRoom={(id) => {
            setRooms((now) => toggled(now, id));
          }}
          onDevice={(id) => {
            setDevices((now) => toggled(now, id));
          }}
        />
      )}
    </EditorSheet>
  );
}
