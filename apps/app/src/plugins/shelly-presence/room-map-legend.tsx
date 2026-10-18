import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import type { ShellyDevice, ShellyZone } from '@smarteverything/shelly';
import { Dot } from '../../components/badge';
import { Interactive } from '../../components/interactive';
import { Text } from '../../components/text';
import { cn } from '../../design/cn';
import { useColour } from '../../design/colour';
import { relative } from '../../format/time';
import { zoneCount, zoneState } from './presence-model';

export function useZoneColours(sensor: ShellyDevice): ReadonlyMap<string, string> {
  const palette = [
    useColour('viz-1'),
    useColour('viz-2'),
    useColour('viz-3'),
    useColour('viz-4'),
    useColour('viz-5'),
    useColour('viz-6'),
  ];
  const primary = useColour('primary');
  const named = sensor.zones.filter((zone) => !zone.main);
  return new Map(
    sensor.zones.map((zone) => {
      const rgb = zone.config.color;
      if (zone.main) return [zone.key, primary];
      if (rgb !== undefined && rgb !== null) return [zone.key, `rgb(${rgb.join(',')})`];
      return [zone.key, palette[named.indexOf(zone) % palette.length] ?? primary];
    }),
  );
}

export function zoneName(zone: ShellyZone): string {
  return zone.config.name ?? (zone.main ? 'Main zone' : zone.key);
}

export function zoneLine(sensor: ShellyDevice, zone: ShellyZone | null): string {
  const state = zoneState(sensor, zone);
  if (state === 'Disabled') return 'Detection off';
  return state === 'Occupied' ? `${state} · ${zoneCount(sensor, zone)}` : state;
}

export function lightWord(sensor: ShellyDevice): string | null {
  const word = sensor.light[0]?.status?.illumination ?? null;
  return word === null ? null : `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
}

export function statusLine(sensor: ShellyDevice): string {
  const main = sensor.zones.find((zone) => zone.main) ?? null;
  const state = zoneState(sensor, main);
  if (sensor.connection.state !== 'online')
    return sensor.observedAt === null
      ? state
      : `${state} · last map ${relative(sensor.observedAt, Date.now())}`;
  const count = zoneCount(sensor, main);
  const objects = count === '1' ? '1 object' : `${count} objects`;
  return [state, state === 'Occupied' ? objects : null, lightWord(sensor)]
    .filter((part) => part !== null)
    .join(' · ');
}

export function Swatch({
  colour,
  off = false,
  size = 14,
}: {
  readonly colour: string;
  readonly off?: boolean;
  readonly size?: number;
}): ReactNode {
  const middle = size / 2;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${String(size)} ${String(size)}`}>
      <Circle
        cx={middle}
        cy={middle}
        r={middle - 1}
        fill={off ? 'none' : colour}
        fillOpacity={off ? 0 : 0.35}
        stroke={colour}
        strokeWidth={1.5}
        {...(off ? { strokeDasharray: '2 2' } : {})}
      />
    </Svg>
  );
}

function HatchSwatch(): ReactNode {
  const ink = useColour('on-surface-faint');
  const edge = useColour('outline');
  return (
    <Svg width={14} height={14} viewBox="0 0 14 14">
      <Path
        d="M.5 3a2.5 2.5 0 0 1 2.5-2.5h8A2.5 2.5 0 0 1 13.5 3v8a2.5 2.5 0 0 1-2.5 2.5H3A2.5 2.5 0 0 1 .5 11Z"
        fill="none"
        stroke={edge}
      />
      <Path d="M1 8L8 1M1 13L13 1M6 13L13 6" stroke={ink} strokeWidth={1} />
    </Svg>
  );
}

const CHIP = 'flex-row items-center gap-2 rounded-full border-hairline px-3';
const IDLE = 'border-outline-variant bg-surface-1';

function Chip({ children }: { readonly children: ReactNode }): ReactNode {
  return <View className={cn(CHIP, IDLE, 'min-h-8')}>{children}</View>;
}

export interface MapLegendProps {
  readonly sensor: ShellyDevice;
  readonly colours: ReadonlyMap<string, string>;
  readonly blindSpots: number;
  readonly selected?: string | null;
  readonly onSelect?: (key: string) => void;
  readonly tracking?: number | null;
  readonly limit?: number;
}

function ZoneChip({
  sensor,
  zone,
  colour,
  selected,
  onSelect,
}: {
  readonly sensor: ShellyDevice;
  readonly zone: ShellyZone;
  readonly colour: string;
  readonly selected: boolean;
  readonly onSelect: ((key: string) => void) | undefined;
}): ReactNode {
  const line = zoneLine(sensor, zone);
  if (onSelect === undefined)
    return (
      <Chip>
        <Swatch colour={colour} off={zone.config.enable === false} />
        <Text variant="label" numberOfLines={1} className="shrink">
          {`${zoneName(zone)} · ${line}`}
        </Text>
      </Chip>
    );
  return (
    <Interactive
      label={`${zoneName(zone)}, ${line}`}
      selected={selected}
      onPress={() => {
        onSelect(zone.key);
      }}
      className={cn(
        CHIP,
        'min-h-touch-min max-w-72',
        selected ? 'border-primary bg-primary-container' : IDLE,
      )}
      layerClassName="rounded-full"
    >
      <Swatch colour={colour} off={zone.config.enable === false} />
      <Text variant="label" numberOfLines={1} className="shrink">
        {`${zoneName(zone)} · ${line}`}
      </Text>
    </Interactive>
  );
}

export function MapLegend({
  sensor,
  colours,
  blindSpots,
  selected = null,
  onSelect,
  tracking = null,
  limit = Infinity,
}: MapLegendProps): ReactNode {
  const primary = useColour('primary');
  return (
    <View
      className="flex-row flex-wrap gap-2"
      accessibilityRole="summary"
      accessibilityLabel="Map legend"
    >
      {sensor.zones
        .filter((zone) => !zone.main)
        .slice(0, limit)
        .map((zone) => (
          <ZoneChip
            key={zone.key}
            sensor={sensor}
            zone={zone}
            colour={colours.get(zone.key) ?? primary}
            selected={selected === zone.key}
            onSelect={onSelect}
          />
        ))}
      {blindSpots === 0 ? null : (
        <Chip>
          <HatchSwatch />
          <Text variant="label">
            {blindSpots === 1 ? '1 blind spot' : `${String(blindSpots)} blind spots`}
          </Text>
        </Chip>
      )}
      {tracking === null ? null : (
        <Chip>
          <Dot tone="positive" />
          <Text variant="label">
            {tracking === 1 ? 'Tracking 1 object' : `Tracking ${String(tracking)} objects`}
          </Text>
        </Chip>
      )}
    </View>
  );
}
