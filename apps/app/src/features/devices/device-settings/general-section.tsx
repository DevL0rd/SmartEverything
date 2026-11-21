import type { ReactNode } from 'react';
import { useState } from 'react';
import { ListRow } from '../../../components/list-row';
import { SelectRow, SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { TextEditSheet, type TextEditRequest } from '../../../settings/text-edit-sheet';
import { useRooms } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { changeDevice, writeDevice } from '../data/change-device';
import { useEntityStore } from '../../../store/store-context';
import { DeviceAlertsRow } from './device-alerts-row';

const NO_ROOM = 'no-room';

function NameRow({ device, name }: { readonly device: Device; readonly name: string }): ReactNode {
  const [request, setRequest] = useState<TextEditRequest | null>(null);
  const store = useEntityStore();
  return (
    <>
      <ListRow
        title="Name"
        value={name}
        icon="pencil"
        chevron
        onPress={() => {
          setRequest({
            title: 'Rename device',
            label: 'Name',
            initial: device.label,
            placeholder: 'Device name',
            confirmLabel: 'Rename',
            maxLength: 120,
            save: (value) => writeDevice(store, device.id, { display_name: value }),
          });
        }}
      />
      <TextEditSheet
        request={request}
        onClose={() => {
          setRequest(null);
        }}
      />
    </>
  );
}

export function GeneralSection({
  device,
  name,
}: {
  readonly device: Device;
  readonly name: string;
}): ReactNode {
  const rooms = useRooms();
  const store = useEntityStore();
  return (
    <List title="General">
      <NameRow device={device} name={name} />
      <SelectRow
        title="Room"
        icon="house"
        options={[
          ...rooms.map((room) => ({ value: room.id, label: room.name })),
          { value: NO_ROOM, label: 'No room' },
        ]}
        value={device.room_id ?? NO_ROOM}
        onChange={(value) => {
          changeDevice(store, device, name, { room_id: value === NO_ROOM ? null : value });
        }}
      />
      <SwitchRow
        title="Favourite"
        icon="star"
        value={device.favourite}
        onChange={(favourite) => {
          changeDevice(store, device, name, { favourite });
        }}
      />
      <DeviceAlertsRow deviceId={device.id} />
      <SwitchRow
        title="Show on Home"
        subtitle="Hidden devices stay on the Devices page"
        icon="eye"
        value={!device.hidden}
        onChange={(shown) => {
          changeDevice(store, device, name, { hidden: !shown });
        }}
      />
    </List>
  );
}
