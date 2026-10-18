import type { ReactNode } from 'react';
import { mainPageSettings } from '../../app-shell/main-pages';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Logger } from '@smarteverything/logging';
import { href } from '../../app-shell/hrefs';
import { Banner } from '../../components/banner';
import { Button } from '../../components/button';
import { EmptyState } from '../../components/empty-state';
import { PageHeader } from '../../components/page-header';
import { useLifecycleLog } from '../../components/use-lifecycle-log';
import { Screen } from '../../components/screen';
import { useListedDevices, useRooms } from '../../store/selectors';
import type { Device } from '../../store/state';
import { ComfortStrip } from '../climate';
import { isOffline } from '../devices';
import { DeviceFilters } from './components/device-filters';
import { DeviceGrid } from './components/device-grid';
import { GroupsStrip } from './components/groups-strip';
import {
  ANY,
  NO_ROOM,
  groupedDevices,
  isFiltering,
  kindOptions,
  roomOptions,
  type DeviceQuery,
  type DeviceSection,
} from './model/device-filter';

const log = new Logger('app.device-list');

const ADD_DEVICE = href.settings.page('devices/add');

function useQuery(): readonly [DeviceQuery, (query: DeviceQuery) => void] {
  const { status, room } = useLocalSearchParams<{ status?: string; room?: string }>();
  const [query, setQuery] = useState<DeviceQuery>({
    text: '',
    room: room ?? ANY,
    kind: ANY,
    offline: status === 'offline',
  });
  return [query, setQuery];
}

function NoDevices(): ReactNode {
  return (
    <Screen
      header={<PageHeader title="Devices" settings={mainPageSettings('devices')} back={false} />}
      maxWidth="reading"
    >
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
  filtering,
  children,
}: {
  readonly room: string | null;
  readonly allOffline: boolean;
  readonly filtering: boolean;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View className="px-gutter">
      <View className="w-full max-w-dashboard gap-3 self-center pb-1">
        {children}
        {allOffline ? (
          <Banner
            tone="warning"
            title="All devices are offline"
            body="Check that the hub and your Wi-Fi are on."
          />
        ) : null}
        {filtering ? null : <GroupsStrip />}
        <ComfortStrip room={room} />
      </View>
    </View>
  );
}

function NoMatch({
  text,
  onReset,
}: {
  readonly text: string;
  readonly onReset: () => void;
}): ReactNode {
  return (
    <EmptyState
      icon="search"
      title="No devices match"
      body={
        text === ''
          ? 'No device matches these filters.'
          : `Nothing found for \u201c${text}\u201d. Clear the search or filters.`
      }
      action={<Button label="Clear filters" variant="tonal" onPress={onReset} />}
    />
  );
}

function useSections(
  devices: readonly Device[],
  rooms: ReturnType<typeof useRooms>,
  query: DeviceQuery,
): readonly DeviceSection[] {
  const shownQuery = useDeferredValue(query);
  return useMemo(() => groupedDevices(devices, rooms, shownQuery), [devices, rooms, shownQuery]);
}

function useListLog(
  deviceCount: number,
  sections: readonly DeviceSection[],
  query: DeviceQuery,
): void {
  const shown = sections.reduce((total, section) => total + section.count, 0);
  const { text, room, kind, offline } = query;
  useLifecycleLog(log, 'devices_screen');
  useEffect(() => {
    log.debug('list.filter_changed', () => ({
      textLength: text.trim().length,
      room,
      kind,
      offline,
    }));
  }, [text, room, kind, offline]);
  useEffect(() => {
    log.debug('list.sections_changed', { devices: deviceCount, sections: sections.length, shown });
  }, [deviceCount, sections.length, shown]);
}

function DevicesBody(): ReactNode {
  const devices = useListedDevices();
  const rooms = useRooms();
  const [query, setQuery] = useQuery();
  const sections = useSections(devices, rooms, query);
  useListLog(devices.length, sections, query);
  if (devices.length === 0) {
    return <NoDevices />;
  }
  const room = query.room === ANY || query.room === NO_ROOM ? null : query.room;
  return (
    <Screen
      scroll={false}
      maxWidth="dashboard"
      header={
        <PageHeader
          title="Devices"
          settings={mainPageSettings('devices')}
          back={false}
          search={false}
        />
      }
    >
      <DeviceGrid
        groups={sections}
        header={
          <ListTop room={room} allOffline={devices.every(isOffline)} filtering={isFiltering(query)}>
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
            text={query.text.trim()}
            onReset={() => {
              setQuery({ text: '', room: ANY, kind: ANY, offline: false });
            }}
          />
        }
      />
    </Screen>
  );
}

export function DevicesScreen(): ReactNode {
  const { room, status } = useLocalSearchParams<{ room?: string; status?: string }>();
  return <DevicesBody key={`${room ?? ANY}:${status ?? ANY}`} />;
}
