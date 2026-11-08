import { useId, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { SHELLY_DETECTION_CAPABILITY, type ShellyDevice } from '@smarteverything/shelly';
import { background } from '@smarteverything/logging';
import { Badge } from '../../components/badge';
import { Button } from '../../components/button';
import { StateTimeline } from '../../components/charts';
import { SwitchTrack } from '../../components/switch';
import { Text } from '../../components/text';
import { ActionBand, frameClassOf, type WidgetFrameBox } from '../../components/widget-board';
import { useBandHitSlop } from '../../components/widget-board/band-context';
import { cn } from '../../design/cn';
import { WIDE_VISUAL_PX, WideCard, WideFigure, isWideClass } from '../../features/devices';
import type { WideClass } from '../../features/devices';
import { Stage } from '../../features/home-map/components/stage/stage';
import { stageDimmed } from '../../features/home-map/components/stage/stage-states';
import { selectionTick } from '../../platform/haptics';
import { useControl } from '../../store/control';
import { useSyncStatus } from '../../store/selectors';
import type { Device } from '../../store/state';
import { usePresence } from './presence-data';
import {
  chipOf,
  faceSwitchOf,
  lineOf,
  summaryOf,
  type FaceChip,
  type FaceLine,
  type PresenceFace,
} from './presence-face-model';
import {
  SENSOR_VIEWS,
  describeSensorMap,
  sensorStageContent,
  sensorTrackDraws,
  useSensorView,
  useTrackHistory,
  type SensorMapView,
} from './presence-map';
import { usePresenceFaceChoice } from './presence-face-choice';
import { shownZone } from './presence-model';
import { PresenceTile, PresenceWaiting } from './presence-tile';
import { modelFor } from './room-geometry';
import { RoomMap } from './room-map';
import { MapLegend, useZoneColours } from './room-map-legend';
import { useOccupancy } from './use-occupancy';
import { useLivePresence, type LivePresence } from './use-live-presence';
import type { TrackingLease } from './use-tracking-lease';

const TIMELINE_HEIGHT = 14;
const PANEL_TIMELINE_HEIGHT = 22;

function DetectionAction({ device }: { readonly device: Device }): ReactNode {
  const control = useControl(device.id, SHELLY_DETECTION_CAPABILITY);
  const hitSlop = useBandHitSlop(true);
  const on = control.value === true;
  const disabled = control.offline || control.pending;
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel="Detection"
      accessibilityState={{ checked: on, disabled }}
      disabled={disabled}
      hitSlop={hitSlop}
      onPress={() => {
        selectionTick();
        background(control.set(!on), 'control.set_failed');
      }}
      className={cn('h-control-h flex-row items-center gap-2', disabled && 'opacity-40')}
    >
      <SwitchTrack value={on} />
      <Text variant="footnote" tone="variant">
        Detection
      </Text>
    </Pressable>
  );
}

function OccupancyGraph({
  device,
  live,
  wide,
  offline,
}: {
  readonly device: Device;
  readonly live: boolean;
  readonly wide: boolean;
  readonly offline: boolean;
}): ReactNode {
  const { segments, from, to } = useOccupancy(device, live);
  const height = wide ? PANEL_TIMELINE_HEIGHT : TIMELINE_HEIGHT;
  const empty = offline ? 'Offline' : 'Nobody in the last 24 h';
  return (
    <View className="gap-1">
      <StateTimeline
        segments={segments}
        colours={{ occupied: 'primary' }}
        label="Occupied in the last 24 hours"
        from={from}
        to={to}
        height={height}
        track="surface-2"
        empty={empty}
        {...(wide ? { captions: ['24 h', 'Now'] } : {})}
      />
      <Text variant="caption" tone="variant" numberOfLines={1}>
        Occupied, last 24 h
      </Text>
    </View>
  );
}

function ZoneLegend({ sensor }: { readonly sensor: ShellyDevice }): ReactNode {
  const colours = useZoneColours(sensor);
  return (
    <MapLegend
      sensor={sensor}
      colours={colours}
      blindSpots={modelFor(sensor, undefined, true).blind.count}
    />
  );
}

interface FaceToggle {
  readonly to: PresenceFace;
  readonly pick: (face: PresenceFace) => void;
}

function actionsOf(
  device: Device,
  lease: TrackingLease,
  toggle: FaceToggle | null,
): readonly ReactNode[] {
  return [
    toggle === null ? null : (
      <Button
        key="face"
        {...faceSwitchOf(toggle.to)}
        variant="text"
        onPress={(): void => {
          toggle.pick(toggle.to);
        }}
      />
    ),
    lease.failed === null ? null : (
      <Button key="retry" label="Retry" icon="refresh" variant="text" onPress={lease.retry} />
    ),
    device.parent_id === null ? <DetectionAction key="detection" device={device} /> : null,
  ].filter((action) => action !== null);
}

function MapVisual({
  presence,
  px,
}: {
  readonly presence: LivePresence;
  readonly px: number;
}): ReactNode {
  return (
    <View aria-hidden>
      <RoomMap
        sensor={presence.sensor}
        mini
        width={px}
        height={px}
        live={presence.lease.tracking}
        trail={presence.trail}
      />
    </View>
  );
}

function figuresOf(sensor: ShellyDevice, cls: WideClass): readonly ReactNode[] {
  const lux = sensor.light[0]?.status?.lux ?? null;
  return cls === 'm' || lux === null
    ? []
    : [<WideFigure key="lux" value={String(lux)} unit="lx" caption="Light" />];
}

interface FaceProps {
  readonly device: Device;
  readonly presence: LivePresence;
  readonly cls: WideClass;
  readonly toggle: FaceToggle | null;
  readonly side: number;
}

function RoomFace({ device, presence, cls, toggle }: FaceProps): ReactNode {
  const { frame, onLayout, live, lease, sensor } = presence;
  const zone = shownZone(sensor, device);
  const chip = chipOf(sensor, zone);
  const line = lineOf(sensor, zone, lease.support, lease.failed !== null);
  const panel = cls === 'l' || cls === 'xl';
  const actions = actionsOf(device, lease, toggle);
  return (
    <WideCard
      frame={{ ref: frame, onLayout }}
      cls={cls}
      summary={summaryOf(device.label, chip, line)}
      title={device.label}
      titleLines={2}
      chip={<Badge label={chip.label} tone={chip.tone} />}
      state={
        <Text variant="footnote" tone={line.tone} numberOfLines={1}>
          {line.text}
        </Text>
      }
      visual={<MapVisual presence={presence} px={WIDE_VISUAL_PX[cls]} />}
      figures={figuresOf(sensor, cls)}
      graph={
        <OccupancyGraph
          device={device}
          live={live}
          wide={panel}
          offline={lease.support === 'offline'}
        />
      }
      actions={actions}
      log={<ZoneLegend sensor={sensor} />}
    />
  );
}

function squareOf(side: number): { readonly width: number; readonly height: number } {
  return { width: side, height: side };
}

function MapStage({
  view,
  presence,
  side,
  device,
}: Pick<FaceProps, 'presence' | 'side' | 'device'> & {
  readonly view: SensorMapView;
}): ReactNode {
  const { sensor, lease } = presence;
  const connected = useSyncStatus().status === 'live';
  const stageId = `home-map.shelly-face.${device.id}.${useId()}`;
  const history = useTrackHistory(sensor, lease.tracking);
  const tracks = sensorTrackDraws(view.spot, history, lease.tracking);
  const content = sensorStageContent({
    view,
    stageId,
    label: describeSensorMap(view, sensor.name, tracks.length),
    dimmed: stageDimmed('map', connected),
    shown: '3d',
  });
  return (
    <View
      style={squareOf(side)}
      className="shrink-0 self-start overflow-hidden rounded-lg bg-surface-2"
    >
      <Stage
        variant="face"
        content={content}
        views={SENSOR_VIEWS}
        view="map"
        onViewChange={(): void => undefined}
        tools={null}
      />
    </View>
  );
}

function MapInfo({
  title,
  chip,
  line,
}: {
  readonly title: string;
  readonly chip: FaceChip;
  readonly line: FaceLine;
}): ReactNode {
  return (
    <View
      accessible
      accessibilityLabel={summaryOf(title, chip, line)}
      pointerEvents="none"
      className="min-w-0 gap-0.5"
    >
      <View className="flex-row items-center justify-between gap-2">
        <Text variant="body-strong" numberOfLines={2} className="min-w-0 flex-1">
          {title}
        </Text>
        <Badge label={chip.label} tone={chip.tone} />
      </View>
      <Text variant="footnote" tone={line.tone} numberOfLines={1}>
        {line.text}
      </Text>
    </View>
  );
}

function MapFace({
  device,
  presence,
  cls,
  toggle,
  side,
  view,
}: FaceProps & { readonly view: SensorMapView }): ReactNode {
  const { frame, onLayout, live, lease, sensor } = presence;
  const zone = shownZone(sensor, device);
  const line = lineOf(sensor, zone, lease.support, lease.failed !== null);
  return (
    <View
      ref={frame}
      onLayout={onLayout}
      className={cn('flex-1 flex-row', cls === 'm' ? 'gap-3' : 'gap-4')}
      pointerEvents="box-none"
    >
      <MapStage view={view} presence={presence} side={side} device={device} />
      <View className="min-w-0 flex-1 gap-1.5" pointerEvents="box-none">
        <MapInfo title={device.label} chip={chipOf(sensor, zone)} line={line} />
        <View className="min-h-0 flex-1 justify-end" aria-hidden pointerEvents="none">
          <OccupancyGraph
            device={device}
            live={live}
            wide={cls === 'l' || cls === 'xl'}
            offline={lease.support === 'offline'}
          />
        </View>
        <ActionBand>{actionsOf(device, lease, toggle)}</ActionBand>
      </View>
    </View>
  );
}

function MapHost(props: FaceProps): ReactNode {
  const view = useSensorView(props.presence.sensor, props.device.id);
  return view === null ? <RoomFace {...props} /> : <MapFace {...props} view={view} />;
}

function ReadyCard({
  device,
  base,
  cls,
  side,
}: {
  readonly device: Device;
  readonly base: ShellyDevice;
  readonly cls: WideClass;
  readonly side: number;
}): ReactNode {
  const presence = useLivePresence(base);
  const { face, to, pick } = usePresenceFaceChoice(device.id);
  const toggle = to === null ? null : { to, pick };
  const props = { device, presence, cls, toggle, side };
  return face === 'map' ? <MapHost {...props} /> : <RoomFace {...props} />;
}

function mapSideOf(frame: WidgetFrameBox): number {
  return Math.min(frame.height, Math.floor(frame.width / 2));
}

export function PresenceWideCard({
  device,
  frame,
  showRoom,
}: {
  readonly device: Device;
  readonly frame: WidgetFrameBox;
  readonly showRoom: boolean;
}): ReactNode {
  const cls = frameClassOf(frame);
  const stream = usePresence(device);
  if (!isWideClass(cls)) {
    return <PresenceTile device={device} showRoom={showRoom} layout="row" />;
  }
  if (stream.state !== 'ready') {
    return <PresenceWaiting device={device} cls={cls} />;
  }
  return <ReadyCard device={device} base={stream.value} cls={cls} side={mapSideOf(frame)} />;
}
