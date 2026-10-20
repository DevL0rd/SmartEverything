import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SHELLY_DETECTION_CAPABILITY, type ShellyDevice } from '@smarteverything/shelly';
import { background } from '@smarteverything/logging';
import { Badge } from '../../components/badge';
import { Button } from '../../components/button';
import { StateTimeline } from '../../components/charts';
import { Switch } from '../../components/switch';
import { Text } from '../../components/text';
import { frameClassOf, type WidgetFrameBox } from '../../components/widget-board';
import { WIDE_VISUAL_PX, WideCard, WideFigure, isWideClass } from '../../features/devices';
import type { WideClass } from '../../features/devices';
import { useControl } from '../../store/control';
import type { Device } from '../../store/state';
import { usePresence } from './presence-data';
import { chipOf, lineOf, summaryOf } from './presence-face-model';
import { shownZone } from './presence-model';
import { PresenceTile } from './presence-tile';
import { modelFor } from './room-geometry';
import { RoomMap } from './room-map';
import { MapLegend, useZoneColours } from './room-map-legend';
import { useOccupancy } from './use-occupancy';
import { useLivePresence, type LivePresence } from './use-live-presence';
import type { TrackingLease } from './use-tracking-lease';

const TIMELINE_HEIGHT = 14;
const PANEL_TIMELINE_HEIGHT = 22;
const LEGEND_LIMIT = 4;

function DetectionAction({ device }: { readonly device: Device }): ReactNode {
  const control = useControl(device.id, SHELLY_DETECTION_CAPABILITY);
  return (
    <View className="flex-row items-center gap-2">
      <Switch
        label="Detection"
        value={control.value === true}
        disabled={control.offline || control.pending}
        onChange={(next) => {
          background(control.set(next), 'control.set_failed');
        }}
      />
      <Text variant="footnote" tone="variant">
        Detection
      </Text>
    </View>
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
        captions={['24 h', 'Now']}
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
      limit={LEGEND_LIMIT}
    />
  );
}

function actionsOf(device: Device, lease: TrackingLease): readonly ReactNode[] {
  return [
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

function ReadyCard({
  device,
  base,
  cls,
}: {
  readonly device: Device;
  readonly base: ShellyDevice;
  readonly cls: WideClass;
}): ReactNode {
  const presence = useLivePresence(base);
  const { frame, onLayout, live, lease, sensor } = presence;
  const zone = shownZone(sensor, device);
  const chip = chipOf(sensor, zone);
  const line = lineOf(sensor, zone, lease.support, lease.failed !== null);
  const panel = cls === 'l' || cls === 'xl';
  return (
    <WideCard
      frame={{ ref: frame, onLayout }}
      cls={cls}
      summary={summaryOf(device.label, chip, line)}
      title={device.label}
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
      actions={actionsOf(device, lease)}
      log={panel ? <ZoneLegend sensor={sensor} /> : undefined}
    />
  );
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
  if (stream.state !== 'ready' || !isWideClass(cls))
    return <PresenceTile device={device} showRoom={showRoom} />;
  return <ReadyCard device={device} base={stream.value} cls={cls} />;
}
