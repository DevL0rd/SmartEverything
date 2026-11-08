import { useCallback, useState, useSyncExternalStore, type ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import type { HomeMapStageView } from '@smarteverything/domain';
import { SHELLY_PAGES, type ShellyDevice, type ShellyPage } from '@smarteverything/shelly';
import { href } from '../../app-shell/hrefs';
import type { CameraPresetId } from '../../components/house-map/3d/render-core-orbit';
import { Card } from '../../components/card';
import { EmptyState } from '../../components/empty-state';
import { visibilityRegistry } from '../../components/house-map/live-visibility/registry';
import { Skeleton } from '../../components/skeleton';
import { Text } from '../../components/text';
import { useIsPhone } from '../../design/size-class';
import { DeviceSettingsFrame } from '../../features/devices/device-settings/settings-frame';
import { useHomeMap } from '../../features/home-map/data/home-map-query';
import { NoMapEntry, mapIsBlank } from '../../features/home-map/components/stage/no-map-entry';
import { Stage, type StageContent } from '../../features/home-map/components/stage/stage';
import {
  stageDimmed,
  stageIdOf,
  stageNotices,
  stageNoticesNode,
} from '../../features/home-map/components/stage/stage-states';
import { HOME_MAP_EDITOR, heroFrameStyle, heroViewFacts } from '../../features/home/model/hero';
import { useStageLights, useStageViews } from '../../features/home-map/model/stage-view';
import { useSyncStatus } from '../../store/selectors';
import type { Device } from '../../store/state';
import { CataloguePage } from './catalogue-page';
import { LiveRoomMap } from './live-room-map';
import { usePresence, useTracked } from './presence-data';
import {
  describeSensorMap,
  sensorStageContent,
  sensorTrackDraws,
  useSensorView,
  useTrackHistory,
  type SensorMapView,
} from './presence-map';
import { SHELLY_STAGE_PAGE } from './presence-stage';
import { RoomSettings } from './room-settings';
import { useTrackingLease, type TrackingLease } from './use-tracking-lease';

export function PresencePage({
  device,
  page,
}: {
  readonly device: Device;
  readonly page: ShellyPage;
}): ReactNode {
  const stream = usePresence(device);
  const title = SHELLY_PAGES.find((item) => item.id === page)?.title ?? 'Shelly Presence';
  return (
    <DeviceSettingsFrame deviceId={device.id} name={device.label} title={title}>
      {stream.state !== 'ready' ? (
        <EmptyState
          icon="motion"
          title="Sensor configuration unavailable"
          body={stream.state === 'invalid' ? stream.reason : 'Waiting for the connected sensor.'}
        />
      ) : page === 'presence-room' ? (
        <RoomSettings sensor={stream.value} />
      ) : (
        <CataloguePage sensor={stream.value} page={page} />
      )}
    </DeviceSettingsFrame>
  );
}

function useStageLive(stageId: string): boolean {
  const subscribe = useCallback(
    (listener: () => void) => visibilityRegistry.subscribeStage(stageId, listener),
    [stageId],
  );
  const read = useCallback(() => visibilityRegistry.getStage(stageId).live, [stageId]);
  return useSyncExternalStore(subscribe, read, read);
}

interface SensorStage {
  readonly content: StageContent;
  readonly lease: TrackingLease;
  readonly notices: ReactNode;
}

function useSensorStage(
  view: SensorMapView,
  sensor: ShellyDevice,
  deviceId: string,
  shown: HomeMapStageView,
): SensorStage {
  const connected = useSyncStatus().status === 'live';
  const stageId = stageIdOf({ kind: 'shelly-page', deviceId, sensorId: sensor.externalId });
  const lease = useTrackingLease(sensor, useStageLive(stageId));
  const tracked = useTracked(sensor, lease.tracking);
  const history = useTrackHistory(tracked, lease.tracking);
  const tracks = sensorTrackDraws(view.spot, history, lease.tracking);
  const notices = stageNotices(
    {
      phase: 'map',
      connected,
      loadFailed: false,
      crashed: false,
      leaseFailed: lease.failed !== null,
      madeFromRobot: false,
      mapNotices: [],
    },
    { onRetryLive: lease.retry },
  );
  const label = describeSensorMap(view, sensor.name, tracks.length);
  const dimmed = stageDimmed('map', connected);
  return {
    content: sensorStageContent({ view, stageId, label, dimmed, shown }),
    lease,
    notices: stageNoticesNode(notices),
  };
}

function PlacedSensorMap({
  view,
  sensor,
  deviceId,
}: {
  readonly view: SensorMapView;
  readonly sensor: ShellyDevice;
  readonly deviceId: string;
}): ReactNode {
  const router = useRouter();
  const phone = useIsPhone();
  const { height } = useWindowDimensions();
  const { map } = useHomeMap();
  const views = useStageViews(SHELLY_STAGE_PAGE, heroViewFacts(map, true));
  const lights = useStageLights();
  const [preset, setPreset] = useState<CameraPresetId>('top');
  const stage = useSensorStage(view, sensor, deviceId, views.view);
  return (
    <View style={heroFrameStyle(phone, height)} className="w-full">
      <Stage
        variant="hero"
        className="h-full border-hairline border-outline-variant"
        content={stage.content}
        views={views.views}
        view={views.view}
        onViewChange={views.setView}
        camera={{ preset, onPreset: setPreset }}
        tools={{
          tools3d: views.view === '3d',
          lights,
          onEdit: (): void => {
            router.push(HOME_MAP_EDITOR);
          },
        }}
        pill={stage.lease.tracking ? { text: 'Live', tone: 'working' } : null}
        notices={stage.notices}
      />
    </View>
  );
}

function PresenceMapHero({
  sensor,
  deviceId,
}: {
  readonly sensor: ShellyDevice;
  readonly deviceId: string;
}): ReactNode {
  const { map } = useHomeMap();
  const view = useSensorView(sensor, deviceId);
  if (mapIsBlank(map)) return <NoMapEntry map={map} />;
  if (view === null) return null;
  return <PlacedSensorMap view={view} sensor={sensor} deviceId={deviceId} />;
}

export function PresencePageHero({ device }: { readonly device: Device }): ReactNode {
  const stream = usePresence(device);
  if (stream.state !== 'ready')
    return (
      <Card>
        <Skeleton shape="block" className="h-60" />
        <Text variant="callout" tone="variant">
          {stream.state === 'invalid' ? stream.reason : 'Waiting for the sensor'}
        </Text>
      </Card>
    );
  return (
    <View className="gap-section-gap">
      <PresenceMapHero sensor={stream.value} deviceId={device.id} />
      <LiveRoomMap
        sensor={stream.value}
        addZone={href.settings.device(device.id, 'presence-room')}
      />
    </View>
  );
}
