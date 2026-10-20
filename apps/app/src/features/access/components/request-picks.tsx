import type { ReactNode } from 'react';
import { SelectRow } from '../../../components/rows';
import { useListedDevices, useRooms } from '../../../store/selectors';
import { areaLabels } from '../model/scopes';

export function AreaPick({
  value,
  onChange,
}: {
  readonly value: string | null;
  readonly onChange: (value: string) => void;
}): ReactNode {
  return (
    <SelectRow title="Part of the app" options={areaLabels()} value={value} onChange={onChange} />
  );
}

export function PlacePick({
  value,
  onChange,
}: {
  readonly value: string | null;
  readonly onChange: (value: string) => void;
}): ReactNode {
  const rooms = useRooms();
  const devices = useListedDevices();
  const options = [
    ...rooms.map((room) => ({ value: room.id, label: `${room.name} (room)` })),
    ...devices.map((device) => ({ value: device.id, label: device.label })),
  ];
  return (
    <SelectRow
      title="Device or room"
      options={options}
      value={value}
      onChange={onChange}
      searchable
    />
  );
}
