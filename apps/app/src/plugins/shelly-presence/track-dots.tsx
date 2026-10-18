import { useEffect, type ReactNode } from 'react';
import Animated, { useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import { Circle, G, Text as SvgText } from 'react-native-svg';
import type { ShellyTrack } from '@smarteverything/shelly';
import { DURATION, EASING, useMotion } from '../../design/motion';
import { trackToView } from './room-geometry';
import type { Paint } from './room-map-layers';
import type { Trail } from './track-trail';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedText = Animated.createAnimatedComponent(SvgText);
const TRAIL_OPACITY = [0.5, 0.3, 0.15] as const;
const DOT_RADIUS = 4;
const HALO_RADIUS = 7;
const HALO_OPACITY = 0.28;
const TRAIL_RADIUS = 2.6;
const GLIDE = { duration: DURATION.medium, easing: EASING.standard } as const;

function TrackDot({
  track,
  origin,
  paint,
}: {
  readonly track: ShellyTrack;
  readonly origin: number;
  readonly paint: Paint;
}): ReactNode {
  const { reduced } = useMotion();
  const at = trackToView(track, origin);
  const x = useSharedValue(at.x);
  const y = useSharedValue(at.y);
  useEffect(() => {
    x.set(reduced ? at.x : withTiming(at.x, GLIDE));
    y.set(reduced ? at.y : withTiming(at.y, GLIDE));
  }, [x, y, at.x, at.y, reduced]);
  const centre = useAnimatedProps(() => ({ cx: x.get(), cy: y.get() }));
  const { u, c } = paint;
  const label = useAnimatedProps(() => ({ x: x.get() + 10 * u, y: y.get() - 8 * u }));
  return (
    <G pointerEvents="none">
      <AnimatedCircle
        animatedProps={centre}
        r={HALO_RADIUS * u}
        fill={c.primary}
        fillOpacity={HALO_OPACITY}
      />
      <AnimatedCircle
        animatedProps={centre}
        r={DOT_RADIUS * u}
        fill={c.ink}
        stroke={c.room}
        strokeWidth={2 * u}
      />
      {paint.hero ? (
        <AnimatedText animatedProps={label} fontSize={9 * u} fontFamily="Geist-Medium" fill={c.ink}>
          {String(track.id)}
        </AnimatedText>
      ) : null}
    </G>
  );
}

export function TrackDots({
  tracks,
  origin,
  paint,
}: {
  readonly tracks: readonly ShellyTrack[];
  readonly origin: number;
  readonly paint: Paint;
}): ReactNode {
  return tracks.map((track) => (
    <TrackDot key={track.id} track={track} origin={origin} paint={paint} />
  ));
}

export function TrailLayer({
  trail,
  origin,
  paint,
}: {
  readonly trail: Trail;
  readonly origin: number;
  readonly paint: Paint;
}): ReactNode {
  return trail.slice(0, TRAIL_OPACITY.length).flatMap((frame, step) =>
    frame.map((track) => {
      const at = trackToView(track, origin);
      return (
        <Circle
          key={`${String(step)}-${String(track.id)}`}
          cx={at.x}
          cy={at.y}
          r={TRAIL_RADIUS * paint.u}
          fill={paint.c.primary}
          opacity={TRAIL_OPACITY[step] ?? 0}
        />
      );
    }),
  );
}
