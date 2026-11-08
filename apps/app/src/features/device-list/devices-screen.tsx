import type { ReactNode } from 'react';
import { mainPageSettings } from '../../app-shell/main-pages';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Logger } from '@smarteverything/logging';
import { deviceFamily } from '@smarteverything/domain';
import { href } from '../../app-shell/hrefs';
import { Banner } from '../../components/banner';
import { Button } from '../../components/button';
import { EmptyState } from '../../components/empty-state';
import { PageHeader } from '../../components/page-header';
import { useLifecycleLog } from '../../components/use-lifecycle-log';
import { Screen } from '../../components/screen';
import { Text } from '../../components/text';
import { useListedDevices, useRooms } from '../../store/selectors';
import type { Device } from '../../store/state';
import { isOffline } from '../devices';
import { familyIcon } from '../device-visuals';
import { DeviceFilters } from './components/device-filters';
import { selectionFromQuery, withSelection } from './model/selection-query';
import { NO_SELECTION, NoMapEntry, homeMapRealistic } from '../home-map';
import { SelectedRoomCard, type MapSelectionChip } from './components/map-selection';
import { DeviceGrid } from './components/device-grid';
import { GroupsStrip } from './components/groups-strip';
import { PinnedMap, usePinnedChoice } from './components/pinned-map';
import { PinnedSplit } from './components/pinned-split';
import {
  ANY,
  groupedDevices,
  isFiltering,
  kindOptions,
  roomOptions,
  selectedDevice,
  selectedRoom,
  type DeviceQuery,
  type DeviceSection,
} from './model/device-filter';
import { BLANK_QUERY, withParams } from './model/query-params';

const log = new Logger('app.device-list');

const ADD_DEVICE = href.settings.page('devices/add');

function useQuery(): readonly [DeviceQuery, (query: DeviceQuery) => void] {
  const { status, room, device } = useLocalSearchParams<{
    status?: string;
    room?: string;
    device?: string;
  }>();
  const [query, setQuery] = useState<DeviceQuery>(() =>
    withParams(BLANK_QUERY, { room, status, device }),
  );
  const arrived = `${room ?? ''}|${status ?? ''}|${device ?? ''}`;
  const [syncedFor, setSyncedFor] = useState(arrived);
  if (syncedFor !== arrived) {
    setSyncedFor(arrived);
    setQuery((current) => withParams(current, { room, status, device }));
  }
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
  allOffline,
  filtering,
  room,
  children,
}: {
  readonly allOffline: boolean;
  readonly filtering: boolean;
  readonly room: string | null;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View className="gap-3 px-gutter pb-1">
      <View className="w-full max-w-dashboard gap-3">
        {children}
        {room === null ? null : <SelectedRoomCard roomId={room} />}
        {allOffline ? (
          <Banner
            tone="warning"
            title="All devices are offline"
            body="Check that the hub and your Wi-Fi are on."
          />
        ) : null}
      </View>
      {filtering ? null : <GroupsStrip />}
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

function selectionChip(
  devices: readonly Device[],
  rooms: ReturnType<typeof useRooms>,
  query: DeviceQuery,
  setQuery: (query: DeviceQuery) => void,
): MapSelectionChip | null {
  const onClear = (): void => {
    setQuery(withSelection(query, NO_SELECTION));
  };
  const deviceId = selectedDevice(query);
  const picked = devices.find((device) => device.id === deviceId);
  if (picked !== undefined) {
    return { label: picked.label, icon: familyIcon(deviceFamily(picked)), onClear };
  }
  const roomId = selectedRoom(query);
  const named = rooms.find((room) => room.id === roomId);
  return named === undefined ? null : { label: named.name, icon: 'sofa', onClear };
}

interface ListProps {
  readonly devices: readonly Device[];
  readonly rooms: ReturnType<typeof useRooms>;
  readonly query: DeviceQuery;
  readonly sections: readonly DeviceSection[];
  readonly setQuery: (query: DeviceQuery) => void;
}

function DeviceList({ devices, rooms, query, sections, setQuery }: ListProps): ReactNode {
  const room = selectedRoom(query);
  return (
    <DeviceGrid
      groups={sections}
      selectedDeviceId={selectedDevice(query)}
      selectedRoomId={room}
      status={!isFiltering(query)}
      header={
        <ListTop allOffline={devices.every(isOffline)} filtering={isFiltering(query)} room={room}>
          <DeviceFilters
            query={query}
            rooms={roomOptions(devices, rooms)}
            kinds={kindOptions(devices)}
            all={ANY}
            selection={selectionChip(devices, rooms, query, setQuery)}
            onChange={(next) => {
              setQuery(
                next.room === query.room
                  ? next
                  : withSelection(next, { kind: 'room', roomId: next.room }),
              );
            }}
          />
        </ListTop>
      }
      empty={
        <NoMatch
          text={query.text.trim()}
          onReset={() => {
            setQuery(BLANK_QUERY);
          }}
        />
      }
    />
  );
}

function FoldedSelection({ chip }: { readonly chip: MapSelectionChip | null }): ReactNode {
  return (
    <Text variant="callout" tone="variant" numberOfLines={1}>
      {chip === null ? 'Home map' : `Home map \u00b7 ${chip.label}`}
    </Text>
  );
}

function MapAndList(props: ListProps): ReactNode {
  const { devices, rooms, query, setQuery } = props;
  const choice = usePinnedChoice();
  const list = <DeviceList {...props} />;
  if (choice.kind === 'blank') {
    return (
      <View className="min-h-0 flex-1">
        <NoMapEntry map={choice.map} className="rounded-none border-x-0 border-t-0" />
        <View className="min-h-0 flex-1">{list}</View>
      </View>
    );
  }
  const stage = (
    <PinnedMap
      realistic={homeMapRealistic}
      summary={choice.kind === 'map' ? choice.map : null}
      focus={selectionFromQuery(query)}
      onSelect={(selection) => {
        setQuery(withSelection(query, selection));
      }}
    />
  );
  return (
    <PinnedSplit
      stage={stage}
      bar={<FoldedSelection chip={selectionChip(devices, rooms, query, setQuery)} />}
    >
      {list}
    </PinnedSplit>
  );
}

export function DevicesScreen(): ReactNode {
  const devices = useListedDevices();
  const rooms = useRooms();
  const [query, setQuery] = useQuery();
  const sections = useSections(devices, rooms, query);
  useListLog(devices.length, sections, query);
  if (devices.length === 0) {
    return <NoDevices />;
  }
  return (
    <Screen
      scroll={false}
      maxWidth="full"
      header={
        <PageHeader
          title="Devices"
          settings={mainPageSettings('devices')}
          back={false}
          search={false}
          actions={[{ icon: 'plus', label: 'Add a device', href: ADD_DEVICE, primary: true }]}
        />
      }
    >
      <MapAndList
        devices={devices}
        rooms={rooms}
        query={query}
        sections={sections}
        setQuery={setQuery}
      />
    </Screen>
  );
}
