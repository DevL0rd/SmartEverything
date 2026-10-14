import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import type { ShellyPresenceDevice } from '@smarteverything/domain';
import { Figure } from '../../components/figure';
import { Text } from '../../components/text';
import { useColour } from '../../design/colour';
import type { Device } from '../../store/state';
import { useRoomName } from '../../store/selectors';
import { usePresence } from './presence-data';
import { lightText, shownZone, zoneCount, zoneState } from './presence-model';
import { RoomMap } from './room-map';

export function RadarVisual({ large = false }: { readonly large?: boolean }): ReactNode {
  const primary = useColour('primary');
  const surface = useColour('surface-3');
  const edge = useColour('outline');
  return (
    <Svg width={large ? 120 : 48} height={large ? 120 : 48} viewBox="0 0 100 100">
      <Circle cx={50} cy={50} r={44} fill={primary} opacity={0.035} />
      <Path
        d="M20 30 Q50 8 80 30 M29 39 Q50 24 71 39"
        stroke={primary}
        opacity={0.45}
        strokeWidth={2}
        fill="none"
      />
      <Path
        d="M42 42 H58 Q72 42 72 56 V68 Q72 82 58 82 H42 Q28 82 28 68 V56 Q28 42 42 42 Z"
        fill={surface}
        stroke={edge}
      />
      <Circle cx={50} cy={57} r={7} fill={primary} opacity={0.8} />
      <Path d="M39 73 H61" stroke={edge} strokeWidth={2} />
    </Svg>
  );
}

function CardText({
  device,
  sensor,
  showRoom,
}: {
  readonly device: Device;
  readonly sensor: ShellyPresenceDevice | null;
  readonly showRoom: boolean;
}): ReactNode {
  const room = useRoomName(device.id);
  const state = sensor === null ? 'Unknown' : zoneState(sensor, shownZone(sensor, device));
  return (
    <View className="gap-0.5">
      <Text variant="body-strong" numberOfLines={2}>
        {device.label}
      </Text>
      {showRoom && room !== null ? (
        <Text variant="footnote" tone="variant">
          {room}
        </Text>
      ) : null}
      <Text variant="footnote" tone={state === 'Occupied' ? 'primary' : 'variant'}>
        {state}
      </Text>
      {sensor === null ? null : (
        <Text variant="caption" tone="variant" numberOfLines={1}>
          {lightText(sensor)}
        </Text>
      )}
    </View>
  );
}

function CompactPresenceCard({
  device,
  sensor,
}: {
  readonly device: Device;
  readonly sensor: ShellyPresenceDevice | null;
}): ReactNode {
  const state = sensor === null ? 'Unknown' : zoneState(sensor, shownZone(sensor, device));
  const count = sensor === null ? '—' : zoneCount(sensor, shownZone(sensor, device));
  return (
    <View className="flex-1 flex-row items-center gap-3" pointerEvents="none">
      <RadarVisual />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="body-strong" numberOfLines={1}>
          {device.label}
        </Text>
        <Text
          variant="footnote"
          tone={state === 'Occupied' ? 'primary' : 'variant'}
          numberOfLines={1}
        >
          {state} · {count} detected
        </Text>
        {sensor === null ? null : (
          <Text variant="caption" tone="variant" numberOfLines={1}>
            {lightText(sensor)}
          </Text>
        )}
      </View>
    </View>
  );
}

function MediumPresenceCard({
  device,
  sensor,
  showRoom,
}: {
  readonly device: Device;
  readonly sensor: ShellyPresenceDevice | null;
  readonly showRoom: boolean;
}): ReactNode {
  return (
    <View className="flex-1 flex-row items-center gap-3" pointerEvents="none">
      <View className="min-w-0 flex-1 gap-2">
        <CardText device={device} sensor={sensor} showRoom={showRoom} />
        {sensor === null ? null : (
          <Figure value={zoneCount(sensor, shownZone(sensor, device))} unit="detected" size="s" />
        )}
      </View>
      <View className="w-28">
        {sensor === null ? <RadarVisual /> : <RoomMap sensor={sensor} compact />}
      </View>
    </View>
  );
}

export function PresenceCard({
  device,
  size = 'tile',
  showRoom = true,
}: {
  readonly device: Device;
  readonly size?: string;
  readonly showRoom?: boolean;
}): ReactNode {
  const stream = usePresence(device);
  const sensor = stream.state === 'ready' ? stream.value : null;
  if (size === 'S') return <CompactPresenceCard device={device} sensor={sensor} />;
  if (size === 'M' || size === 'W')
    return <MediumPresenceCard device={device} sensor={sensor} showRoom={showRoom} />;
  return (
    <View className="flex-1 justify-between gap-2" pointerEvents="none">
      <View className="flex-row items-center justify-between gap-2">
        <RadarVisual />
        {sensor === null ? null : (
          <Figure value={zoneCount(sensor, shownZone(sensor, device))} unit="detected" size="s" />
        )}
      </View>
      {sensor !== null && size !== 'tile' ? <RoomMap sensor={sensor} compact /> : null}
      <CardText device={device} sensor={sensor} showRoom={showRoom} />
    </View>
  );
}
