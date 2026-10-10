import type { ReactNode } from 'react';
import { useDeferredValue, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { href } from '../../app-shell/hrefs';
import { Banner } from '../../components/banner';
import { Button } from '../../components/button';
import { EmptyState } from '../../components/empty-state';
import type { IconName } from '../../components/icon';
import type { MenuItem } from '../../components/menu';
import { PageHeader } from '../../components/page-header';
import { Screen } from '../../components/screen';
import { settingsItem } from '../../settings/settings-item';
import { useListedDevices, useRooms } from '../../store/selectors';
import { ComfortStrip, useClimateWidgets } from '../climate';
import { isOffline } from '../devices';
import { DeviceFilters } from './components/device-filters';
import { DeviceGrid } from './components/device-grid';
import {
  ANY,
  NO_ROOM,
  OFFLINE,
  groupedDevices,
  kindOptions,
  roomOptions,
  type DeviceQuery,
} from './model/device-filter';

const ADD_DEVICE = href.settings.page('devices/add');

function menuItem(label: string, icon: IconName, target: Href): MenuItem {
  return {
    label,
    icon,
    onPress: (): void => {
      router.push(target);
    },
  };
}

function useOverflow(): readonly MenuItem[] {
  const climate = useClimateWidgets();
  return [
    ...(climate.airHistory ? [menuItem('Air history', 'activity', href.devicesPage('air'))] : []),
    ...(climate.supplies
      ? [menuItem('Filters & water', 'wrench', href.devicesPage('supplies'))]
      : []),
    menuItem('Add a device', 'plus', ADD_DEVICE),
    menuItem('Rooms', 'grid', href.settings.page('home/rooms')),
    settingsItem(href.settings.page('devices')),
  ];
}

function useQuery(): readonly [DeviceQuery, (query: DeviceQuery) => void] {
  const { status } = useLocalSearchParams<{ status?: string }>();
  const [query, setQuery] = useState<DeviceQuery>({
    text: '',
    room: ANY,
    kind: status === OFFLINE ? OFFLINE : ANY,
  });
  return [query, setQuery];
}

function NoDevices(): ReactNode {
  return (
    <Screen header={<PageHeader title="Devices" back={false} />} maxWidth="reading">
      <EmptyState
        icon="bulb"
        title="No devices yet"
        body="Link the account your devices use, or add one by its address."
        action={<Button label="Add a device" href={ADD_DEVICE} />}
      />
    </Screen>
  );
}

function ListTop({
  room,
  allOffline,
  children,
}: {
  readonly room: string | null;
  readonly allOffline: boolean;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View className="px-gutter">
      <View className="w-full max-w-dashboard gap-3 self-center pb-1">
        {children}
        {allOffline ? (
          <Banner
            tone="warning"
            title="Every device is offline"
            body="They come back when the server can reach them again."
          />
        ) : null}
        <ComfortStrip room={room} />
      </View>
    </View>
  );
}

function NoMatch({ onReset }: { readonly onReset: () => void }): ReactNode {
  return (
    <EmptyState
      icon="search"
      title="No devices match"
      body="Try another name, room or kind."
      action={<Button label="Show all devices" variant="tonal" onPress={onReset} />}
    />
  );
}

export function DevicesScreen(): ReactNode {
  const devices = useListedDevices();
  const rooms = useRooms();
  const [query, setQuery] = useQuery();
  const shownQuery = useDeferredValue(query);
  const overflow = useOverflow();
  if (devices.length === 0) {
    return <NoDevices />;
  }
  const room = query.room === ANY || query.room === NO_ROOM ? null : query.room;
  return (
    <Screen
      scroll={false}
      maxWidth="dashboard"
      header={<PageHeader title="Devices" back={false} search={false} overflow={overflow} />}
    >
      <DeviceGrid
        groups={groupedDevices(devices, rooms, shownQuery)}
        header={
          <ListTop room={room} allOffline={devices.every(isOffline)}>
            <DeviceFilters
              query={query}
              rooms={roomOptions(devices, rooms)}
              kinds={kindOptions(devices)}
              all={ANY}
              onChange={setQuery}
            />
          </ListTop>
        }
        empty={
          <NoMatch
            onReset={() => {
              setQuery({ text: '', room: ANY, kind: ANY });
            }}
          />
        }
      />
    </Screen>
  );
}
