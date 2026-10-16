import type { ShellyArea, ShellyPresenceDevice, ShellyTrack } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, G, Line, Path, Pattern } from 'react-native-svg';
import { Text } from '../../components/text';
import { useColour } from '../../design/colour';
import { useSvgId } from '../../features/device-visuals';
import { sensorOrigin } from './area-context';
import { painterViewport } from './painter-viewport';

function segmentPath([x1, y1, x2, y2]: ShellyArea[number]): string {
  return `M${String(8 - x1)} ${String(y1)} H${String(8 - x2)} V${String(y2)} H${String(8 - x1)} Z`;
}

export function PresenceTracks({
  tracks,
  colour,
}: {
  readonly tracks: readonly ShellyTrack[];
  readonly colour: string;
}): ReactNode {
  return tracks.map((track) => (
    <Circle key={track.id} cx={8 - track.x * 2} cy={track.y * 2} r={0.2} fill={colour} />
  ));
}

function MapAreas({
  sensor,
  area,
  primary,
  edge,
}: {
  readonly sensor: ShellyPresenceDevice;
  readonly area: ShellyArea | undefined;
  readonly primary: string;
  readonly edge: string;
}): ReactNode {
  if (area !== undefined)
    return area.map((segment, index) => (
      <Path
        key={index}
        d={segmentPath(segment)}
        fill={primary}
        fillOpacity={0.16}
        stroke={primary}
        strokeWidth={0.07}
      />
    ));
  return sensor.zones.map((zone) => (
    <G key={zone.key}>
      {zone.config.area.map((segment, index) => (
        <Path
          key={index}
          d={segmentPath(segment)}
          fill={zone.config.color === undefined ? primary : `rgb(${zone.config.color.join(',')})`}
          fillOpacity={zone.status?.value === true ? 0.2 : 0.06}
          stroke={zone.main ? primary : edge}
          {...(zone.config.enable ? {} : { strokeDasharray: '0.15 0.15' })}
          strokeWidth={0.07}
        />
      ))}
    </G>
  ));
}

function MapCanvas({
  sensor,
  area,
  live,
  compact,
}: {
  readonly sensor: ShellyPresenceDevice;
  readonly area: ShellyArea | undefined;
  readonly live: boolean;
  readonly compact: boolean;
}): ReactNode {
  const primary = useColour('primary');
  const edge = useColour('outline');
  const faint = useColour('on-surface-faint');
  const positive = useColour('positive');
  const hatch = useSvgId('blind');
  const blind = sensor.config?.blind ?? [];
  const zones = area ?? sensor.zones.flatMap((zone) => zone.config.area);
  const viewport = painterViewport([...zones, ...blind]);
  const origin = sensorOrigin(sensor.config?.sensor?.position);
  return (
    <Svg
      width="100%"
      height={compact ? 96 : 280}
      viewBox={`${String(viewport.left)} ${String(viewport.top)} ${String(viewport.columns)} ${String(viewport.rows)}`}
    >
      <Defs>
        <Pattern id={hatch} width={0.4} height={0.4} patternUnits="userSpaceOnUse">
          <Path d="M0 0 L0.4 0.4" stroke={faint} strokeWidth={0.06} />
        </Pattern>
      </Defs>
      <MapAreas sensor={sensor} area={area} primary={primary} edge={edge} />
      {blind.map((segment, index) => (
        <Path
          key={index}
          d={segmentPath(segment)}
          fill={`url(#${hatch})`}
          stroke={faint}
          strokeWidth={0.05}
        />
      ))}
      <Line x1={8} y1={0} x2={8} y2={viewport.rows} stroke={edge} strokeWidth={0.03} />
      {live && sensor.connection.state === 'online' ? (
        <PresenceTracks tracks={sensor.tracks} colour={positive} />
      ) : null}
      <Circle cx={origin} cy={0} r={0.22} fill={primary} />
    </Svg>
  );
}

export function RoomMap({
  sensor,
  area,
  live = false,
  compact = false,
}: {
  readonly sensor: ShellyPresenceDevice;
  readonly area?: ShellyArea;
  readonly live?: boolean;
  readonly compact?: boolean;
}): ReactNode {
  return (
    <View className="gap-2" accessibilityLabel="Sensor room and zones map">
      <MapCanvas sensor={sensor} area={area} live={live} compact={compact} />
      {compact ? null : (
        <Text variant="caption" tone="variant">
          Sensor x ← · y ↓ · boundary grid units (0.5 m)
        </Text>
      )}
    </View>
  );
}
