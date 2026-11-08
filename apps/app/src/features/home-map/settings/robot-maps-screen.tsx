import { useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import {
  isVacuumTaskPhase,
  vacuumPhase,
  type DevicePresentation,
  type HomeMapFeed,
  type JsonValue,
  type PresentedCapability,
} from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import { SettingsFrame } from '../../../settings/settings-frame';
import { useControl } from '../../../store/control';
import { useDevices } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import {
  CapabilityRow,
  MAP_UPLOAD_NOTE,
  approved,
  argumentsOf,
  deviceModelOf,
  offlineReason,
  presentedFor,
  presentedRows,
  useDisplayName,
  useVacuum,
} from '../../devices';
import { RobotMapFeed, useFeedData } from '../components/robot-map-feed';
import { HOME_MAP_SETTINGS_PAGE } from '../settings';

const log = new Logger('app.home-map');

export const ROBOT_MAPS_TITLE = 'Robot maps';

export const ROBOT_MAPS_INTRO =
  'Set this once. Each time the robot finishes a map, the floor it feeds updates on its own.';

export const ROBOT_MAP_ROWS: readonly string[] = [
  'vacuum_map_switch',
  'vacuum_build_map',
  'vacuum_save_map',
  'vacuum_auto_partition',
  'vacuum_stop_map_upload',
  'vacuum_set_map_name',
];

export const ROBOT_MAP_GUARDED = {
  title: "Erase or replace the robot's map",
  note: 'These cannot be undone. Each one asks you to type DELETE first.',
  rows: ['vacuum_restore_map', 'vacuum_clear_map', 'vacuum_delete_map'],
} as const;

export const USE_MAP_ROLE = 'vacuum_set_map';

export interface UseMapState {
  readonly online: boolean;
  readonly working: boolean;
  readonly isCurrent: boolean;
  readonly argumentCount: number;
  readonly deviceName: string;
}

export function mapNowReason(state: UseMapState): string | null {
  if (!state.online) return offlineReason(state.deviceName);
  if (state.isCurrent) return 'The robot uses this map now';
  if (state.working) return 'Wait until the robot finishes its job';
  return state.argumentCount === 1 ? null : 'This robot cannot switch maps from here';
}

export function setMapValue(presented: PresentedCapability, robotMapId: number): JsonValue {
  return Object.fromEntries(argumentsOf(presented).map((name) => [name, robotMapId]));
}

function useMapNow(
  device: Device,
  presented: PresentedCapability,
  robotMapId: number,
): { readonly run: () => void; readonly pending: boolean } {
  const control = useControl(device.id, presented.key);
  const name = useDisplayName(device.id);
  const busy = useRef(false);
  const [sending, setSending] = useState(false);
  const send = async (): Promise<void> => {
    if (!(await approved(presented, name))) return;
    log.info('home_map.use_robot_map', { deviceId: device.id, robotMapId });
    await control.set(setMapValue(presented, robotMapId));
  };
  return {
    pending: sending || control.pending,
    run: (): void => {
      if (busy.current || control.pending) return;
      busy.current = true;
      setSending(true);
      background(
        send().finally(() => {
          busy.current = false;
          setSending(false);
        }),
        'home_map.use_robot_map_failed',
      );
    },
  };
}

function UseMapNowButton({
  device,
  presented,
  feed,
  working,
}: {
  readonly device: Device;
  readonly presented: PresentedCapability;
  readonly feed: HomeMapFeed;
  readonly working: boolean;
}): ReactNode {
  const deviceName = useDisplayName(device.id);
  const action = useMapNow(device, presented, feed.robotMapId);
  const reason = mapNowReason({
    online: device.online,
    working,
    isCurrent: feed.isCurrent,
    argumentCount: argumentsOf(presented).length,
    deviceName,
  });
  return (
    <View className="items-start gap-1 px-4 py-3">
      <Button
        label="Use this map now"
        icon="route"
        variant="tonal"
        loading={action.pending}
        disabled={reason !== null}
        onPress={action.run}
      />
      {reason === null ? null : (
        <Text variant="footnote" tone="variant">
          {reason}
        </Text>
      )}
    </View>
  );
}

export interface RobotMapActionsProps {
  readonly device: Device;
  readonly presentation: DevicePresentation;
  readonly deviceName: string;
}

export function RobotMapActions({
  device,
  presentation,
  deviceName,
}: RobotMapActionsProps): ReactNode {
  const reason = device.online ? null : offlineReason(deviceName);
  const rows = presentedRows(presentation, ROBOT_MAP_ROWS);
  const guarded = presentedRows(presentation, ROBOT_MAP_GUARDED.rows);
  const row = (presented: PresentedCapability): ReactNode => (
    <CapabilityRow key={presented.key} device={device} presented={presented} reason={reason} />
  );
  return (
    <View className="gap-section-gap">
      {rows.length === 0 ? null : (
        <List title={`${deviceName} · map actions`} footer={MAP_UPLOAD_NOTE}>
          {rows.map(row)}
        </List>
      )}
      {guarded.length === 0 ? null : (
        <List title={ROBOT_MAP_GUARDED.title} footer={ROBOT_MAP_GUARDED.note}>
          {guarded.map(row)}
        </List>
      )}
    </View>
  );
}

function RobotSection({ device }: { readonly device: Device }): ReactNode {
  const vacuum = useVacuum(device);
  const deviceName = useDisplayName(device.id);
  const working = isVacuumTaskPhase(vacuumPhase(vacuum.snapshot.values));
  const useMap = presentedFor(vacuum.presentation, USE_MAP_ROLE);
  return (
    <View className="gap-section-gap">
      <RobotMapFeed
        variant="cards"
        deviceId={device.id}
        {...(useMap === undefined
          ? {}
          : {
              renderCardExtra: (feed: HomeMapFeed): ReactNode => (
                <UseMapNowButton device={device} presented={useMap} feed={feed} working={working} />
              ),
            })}
      />
      <RobotMapActions device={device} presentation={vacuum.presentation} deviceName={deviceName} />
    </View>
  );
}

const ROBOT_MAP_REFS: readonly string[] = [
  ...ROBOT_MAP_ROWS,
  ...ROBOT_MAP_GUARDED.rows,
  USE_MAP_ROLE,
];

export function presentsRobotMapRows(presentation: DevicePresentation): boolean {
  return presentedRows(presentation, ROBOT_MAP_REFS).length > 0;
}

export function robotsOf(
  feeds: readonly HomeMapFeed[],
  devices: readonly Device[],
): readonly Device[] {
  const ids = new Set(feeds.map((feed) => feed.deviceId));
  return devices.filter(
    (device) => ids.has(device.id) || presentsRobotMapRows(deviceModelOf(device).presentation),
  );
}

function RobotSections(): ReactNode {
  const { feeds } = useFeedData();
  const devices = useDevices();
  const robots = robotsOf(feeds ?? [], devices);
  if (robots.length === 0) {
    if (feeds === null) return null;
    return (
      <View className="w-full max-w-reading self-start">
        <EmptyState
          icon="route"
          title="No robot maps yet"
          body="When a robot vacuum finishes its first map, it shows up here."
        />
      </View>
    );
  }
  return (
    <View className="flex-row flex-wrap items-start gap-section-gap">
      {robots.map((device) => (
        <View key={device.id} className="min-w-0 max-w-reading grow shrink basis-96">
          <RobotSection device={device} />
        </View>
      ))}
    </View>
  );
}

export function RobotMapsScreen(): ReactNode {
  return (
    <SettingsFrame page={HOME_MAP_SETTINGS_PAGE} title={ROBOT_MAPS_TITLE} contentWidth="full">
      <Text variant="body" tone="variant" className="w-full max-w-reading self-start px-4">
        {ROBOT_MAPS_INTRO}
      </Text>
      <RobotSections />
    </SettingsFrame>
  );
}
