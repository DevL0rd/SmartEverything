import type { ReactNode } from 'react';
import { useEffect } from 'react';
import Animated, { useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import { Circle, ClipPath, Defs, G, Path, Pattern } from 'react-native-svg';
import type { ShellyDevice, ShellyTrack } from '@smarteverything/shelly';
import { useColour } from '../../design/colour';
import { DURATION, useMotion } from '../../design/motion';
import { rounded } from '../../features/device-visuals';
import { zoneState } from './presence-model';
import {
  cellsAt,
  sizeOf,
  trackToView,
  type MapModel,
  type Rect,
  type ZoneShape,
} from './room-geometry';

export function useMapColours(): {
  readonly room: string;
  readonly edge: string;
  readonly variant: string;
  readonly faint: string;
  readonly primary: string;
  readonly pill: string;
  readonly ink: string;
} {
  return {
    room: useColour('surface-2'),
    edge: useColour('outline'),
    variant: useColour('on-surface-variant'),
    faint: useColour('on-surface-faint'),
    primary: useColour('primary'),
    pill: useColour('surface-1'),
    ink: useColour('on-surface'),
  };
}

export interface Paint {
  readonly u: number;
  readonly c: ReturnType<typeof useMapColours>;
  readonly hatch: string;
  readonly clip: string;
  readonly hero: boolean;
}

const AnimatedPath = Animated.createAnimatedComponent(Path);
const FOV_METRES = 9;
const FOV_HALF_ANGLE = (50 * Math.PI) / 180;

function rectPath(rect: Rect, radius: number): string {
  const { width, height } = sizeOf(rect);
  return rounded({ x: rect.left, y: rect.top, w: width, h: height, r: radius });
}

export function MapDefs({
  model,
  paint,
}: {
  readonly model: MapModel;
  readonly paint: Paint;
}): ReactNode {
  return (
    <Defs>
      <Pattern id={paint.hatch} width={0.35} height={0.35} patternUnits="userSpaceOnUse">
        <Path d="M0 0.35L0.35 0" stroke={paint.c.faint} strokeWidth={paint.u} />
      </Pattern>
      <ClipPath id={paint.clip}>
        <Path d={rectPath(model.frame.room, 0.15)} />
      </ClipPath>
    </Defs>
  );
}

export function Backdrop({
  model,
  paint,
}: {
  readonly model: MapModel;
  readonly paint: Paint;
}): ReactNode {
  const sx = model.origin / 2;
  const dx = FOV_METRES * Math.sin(FOV_HALF_ANGLE);
  const dy = FOV_METRES * Math.cos(FOV_HALF_ANGLE);
  const radius = String(FOV_METRES);
  return (
    <>
      <Path d={rectPath(model.frame.room, 0.15)} fill={paint.c.room} />
      <G clipPath={`url(#${paint.clip})`}>
        <Path
          d={`M${String(sx)} 0L${String(sx - dx)} ${String(dy)}A${radius} ${radius} 0 0 0 ${String(sx + dx)} ${String(dy)}Z`}
          fill={paint.c.primary}
          fillOpacity={0.06}
        />
      </G>
    </>
  );
}

interface ZonePathProps {
  readonly shape: ZoneShape;
  readonly colour: string;
  readonly level: number;
  readonly enabled: boolean;
  readonly bold: boolean;
  readonly faded: boolean;
  readonly paint: Paint;
  readonly onPress: (() => void) | undefined;
}

function ZonePath({
  shape,
  colour,
  level,
  enabled,
  bold,
  faded,
  paint,
  onPress,
}: ZonePathProps): ReactNode {
  const { reduced } = useMotion();
  const fill = useSharedValue(level);
  useEffect(() => {
    fill.set(reduced ? level : withTiming(level, { duration: DURATION.short }));
  }, [fill, level, reduced]);
  const animated = useAnimatedProps(() => ({ fillOpacity: fill.get() }));
  return (
    <AnimatedPath
      d={shape.path}
      fill={colour}
      animatedProps={animated}
      stroke={colour}
      strokeWidth={(bold ? 3 : 1.5) * paint.u}
      {...(enabled ? {} : { strokeDasharray: `${String(6 * paint.u)} ${String(4 * paint.u)}` })}
      opacity={faded ? 0.4 : 1}
      {...(onPress === undefined ? {} : { onPress })}
    />
  );
}

function trackedIn(shape: ZoneShape, tracks: readonly ShellyTrack[], origin: number): boolean {
  return tracks.some((track) => cellsAt(shape.cells, trackToView(track, origin)));
}

function zoneLevel(enabled: boolean, occupied: boolean): number {
  if (!enabled) return 0.06;
  return occupied ? 0.32 : 0.14;
}

export interface ZoneLayerProps {
  readonly sensor: ShellyDevice;
  readonly model: MapModel;
  readonly paint: Paint;
  readonly colours: ReadonlyMap<string, string>;
  readonly tracks: readonly ShellyTrack[];
  readonly selected: string | null;
  readonly onZone: ((key: string) => void) | undefined;
}

export function ZoneLayer({
  sensor,
  model,
  paint,
  colours,
  tracks,
  selected,
  onZone,
}: ZoneLayerProps): ReactNode {
  return sensor.zones.map((zone) => {
    const shape = model.shapes.get(zone.key);
    if (shape === undefined) return null;
    if (zone.main)
      return (
        <Path
          key={zone.key}
          d={shape.path}
          fill="none"
          stroke={paint.c.primary}
          strokeWidth={1.5 * paint.u}
        />
      );
    return (
      <ZonePath
        key={zone.key}
        shape={shape}
        colour={colours.get(zone.key) ?? paint.c.primary}
        level={zoneLevel(zone.config.enable !== false, zoneState(sensor, zone) === 'Occupied')}
        enabled={zone.config.enable !== false}
        bold={trackedIn(shape, tracks, model.origin)}
        faded={selected !== null && selected !== zone.key}
        paint={paint}
        onPress={
          onZone === undefined
            ? undefined
            : (): void => {
                onZone(zone.key);
              }
        }
      />
    );
  });
}

export function SensorMark({
  model,
  paint,
}: {
  readonly model: MapModel;
  readonly paint: Paint;
}): ReactNode {
  const size = Math.max(0.55, 16 * paint.u);
  const sx = model.origin / 2;
  return (
    <G pointerEvents="none">
      <Path
        d={rounded({ x: sx - size / 2, y: -size * 0.1, w: size, h: size, r: size * 0.27 })}
        fill={paint.c.room}
        stroke={paint.c.edge}
        strokeWidth={1.5 * paint.u}
      />
      <Circle cx={sx} cy={size * 0.4} r={size * 0.2} fill={paint.c.edge} />
    </G>
  );
}
