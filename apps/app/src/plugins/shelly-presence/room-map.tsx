import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import type { ShellyArea, ShellyDevice, ShellyZone, ShellyTrack } from '@smarteverything/shelly';
import { Text } from '../../components/text';
import { useMeasuredWidth } from '../../components/use-measured-width';
import { cn } from '../../design/cn';
import { useSvgId } from '../../features/device-visuals';
import { zoneState } from './presence-model';
import { modelFor, sizeOf, type MapModel, type Rect } from './room-geometry';
import {
  Backdrop,
  MapDefs,
  SensorMark,
  useMapColours,
  ZoneLayer,
  type Paint,
} from './room-map-layers';
import { useZoneColours, zoneName } from './room-map-legend';
import { LabelLayer, Ruler } from './room-map-ruler';
import { TrackDots, TrailLayer } from './track-dots';
import { NO_TRAIL, type Trail } from './track-trail';

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

const HERO_WIDTH = 300;
const MIN_HEIGHT = 240;
const MAX_HEIGHT = 520;

function spoken(sensor: ShellyDevice, zone: ShellyZone): string {
  const state = zoneState(sensor, zone);
  if (state === 'Disabled') return 'detection off';
  if (state !== 'Occupied') return state.toLowerCase();
  const count = zone.status?.num_objects ?? 0;
  return `occupied, ${String(count)} ${count === 1 ? 'object' : 'objects'}`;
}

function summaryOf(sensor: ShellyDevice, model: MapModel): string {
  const { width, height } = sizeOf(model.frame.room);
  const zones = sensor.zones
    .filter((zone) => !zone.main)
    .map((zone) => `${zoneName(zone)}: ${spoken(sensor, zone)}.`);
  const count = model.blind.count;
  const blind = count === 1 ? '1 blind spot.' : `${String(count)} blind spots.`;
  return [
    `Room map. Main zone ${String(width)} by ${String(height)} metres.`,
    ...zones,
    ...(count === 0 ? [] : [blind]),
  ].join(' ');
}

export interface RoomMapProps {
  readonly sensor: ShellyDevice;
  readonly area?: ShellyArea;
  readonly live?: boolean;
  readonly trail?: Trail;
  readonly mini?: boolean;
  readonly selected?: string | null;
  readonly onZone?: (key: string) => void;
  readonly width?: number;
  readonly height?: number;
}

interface Box {
  readonly width: number;
  readonly height: number;
}

function boxOf(props: RoomMapProps, measured: number, view: Rect): Box {
  const width = props.width ?? measured;
  const { width: metresWide, height: metresHigh } = sizeOf(view);
  const natural = (width * metresHigh) / metresWide;
  return { width, height: props.height ?? Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, natural)) };
}

function usePaint(model: MapModel, box: Box, mini: boolean): Paint {
  const { width, height } = sizeOf(model.frame.view);
  return {
    u: 1 / Math.min(box.width / width, box.height / height),
    c: useMapColours(),
    hatch: useSvgId('blind'),
    clip: useSvgId('room'),
    hero: !mini && box.width >= HERO_WIDTH,
  };
}

type CanvasProps = RoomMapProps & {
  readonly model: MapModel;
  readonly box: Box;
  readonly colours: ReadonlyMap<string, string>;
};

function Shapes({
  sensor,
  area,
  selected = null,
  onZone,
  colours,
  model,
  paint,
  tracks,
}: Pick<CanvasProps, 'sensor' | 'area' | 'selected' | 'onZone' | 'colours' | 'model'> & {
  readonly paint: Paint;
  readonly tracks: readonly ShellyTrack[];
}): ReactNode {
  if (area !== undefined)
    return model.area === null ? null : (
      <Path
        d={model.area.path}
        fill={paint.c.primary}
        fillOpacity={0.16}
        stroke={paint.c.primary}
        strokeWidth={1.5 * paint.u}
      />
    );
  return (
    <ZoneLayer
      sensor={sensor}
      model={model}
      paint={paint}
      colours={colours}
      tracks={tracks}
      selected={selected}
      onZone={onZone}
    />
  );
}

function Annotations({
  sensor,
  area,
  mini = false,
  selected = null,
  trail = NO_TRAIL,
  model,
  paint,
  tracks,
}: Pick<CanvasProps, 'sensor' | 'area' | 'mini' | 'selected' | 'trail' | 'model'> & {
  readonly paint: Paint;
  readonly tracks: readonly ShellyTrack[];
}): ReactNode {
  return (
    <>
      {mini || area !== undefined ? null : (
        <LabelLayer sensor={sensor} model={model} paint={paint} selected={selected} />
      )}
      {mini ? null : <Ruler model={model} paint={paint} />}
      <SensorMark model={model} paint={paint} />
      <TrailLayer trail={trail} origin={model.origin} paint={paint} />
      <TrackDots tracks={tracks} origin={model.origin} paint={paint} />
    </>
  );
}

function MapCanvas(props: CanvasProps): ReactNode {
  const { sensor, mini = false, live = false, model, box } = props;
  const paint = usePaint(model, box, mini);
  const { view } = model.frame;
  const { width, height } = sizeOf(view);
  const tracks = live && sensor.connection.state === 'online' ? sensor.tracks : [];
  return (
    <Svg
      width={box.width}
      height={box.height}
      viewBox={`${String(view.left)} ${String(view.top)} ${String(width)} ${String(height)}`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <MapDefs model={model} paint={paint} />
      <Backdrop model={model} paint={paint} />
      <Shapes {...props} paint={paint} tracks={tracks} />
      {model.blind.count === 0 ? null : (
        <Path
          d={model.blind.path}
          fill={`url(#${paint.hatch})`}
          stroke={paint.c.edge}
          strokeWidth={paint.u}
        />
      )}
      <Annotations {...props} paint={paint} tracks={tracks} />
    </Svg>
  );
}

export function RoomMap(props: RoomMapProps): ReactNode {
  const { sensor, area, mini = false } = props;
  const measured = useMeasuredWidth();
  const model = modelFor(sensor, area, mini);
  const box = boxOf(props, measured.width, model.frame.view);
  const colours = useZoneColours(sensor);
  return (
    <View
      className={cn(sensor.connection.state !== 'online' && 'opacity-60')}
      {...(props.width === undefined ? { onLayout: measured.onLayout } : {})}
    >
      <Text className="absolute size-px opacity-0" accessibilityLiveRegion="polite">
        {summaryOf(sensor, model)}
      </Text>
      {box.width > 0 ? <MapCanvas {...props} model={model} box={box} colours={colours} /> : null}
    </View>
  );
}
