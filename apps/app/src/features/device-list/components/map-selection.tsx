import type { ReactNode } from 'react';
import { FlatChoice } from '../../../components/flat-choice';
import type { IconName } from '../../../components/icon-glyphs';
import { RoomCard, useRoomSummary } from '../../home';

export interface MapSelectionChip {
  readonly label: string;
  readonly icon: IconName;
  readonly onClear: () => void;
}

export function SelectionChip({ chip }: { readonly chip: MapSelectionChip }): ReactNode {
  return (
    <FlatChoice
      label={chip.label}
      spoken={`Clear the map selection: ${chip.label}`}
      active
      icon={chip.icon}
      trailing="close"
      onPress={chip.onClear}
    />
  );
}

export function SelectedRoomCard({ roomId }: { readonly roomId: string }): ReactNode {
  const room = useRoomSummary(roomId);
  if (room === null) return null;
  return <RoomCard room={room} dense={false} fitContent />;
}
