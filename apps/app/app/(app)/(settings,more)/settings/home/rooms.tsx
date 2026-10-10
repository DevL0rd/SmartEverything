import type { ReactNode } from 'react';
import { openAddRoom } from '../../../../../src/features/settings/home/rooms';
import { SettingsPageScreen } from '../../../../../src/settings/settings-screen';
import { useRooms } from '../../../../../src/store/selectors';

export default function RoomsSettingsRoute(): ReactNode {
  const count = useRooms().length;
  return (
    <SettingsPageScreen
      page="home/rooms"
      primaryAction={{
        label: 'Add room',
        icon: 'plus',
        extended: count === 0,
        onPress: () => {
          openAddRoom(count);
        },
      }}
    />
  );
}
