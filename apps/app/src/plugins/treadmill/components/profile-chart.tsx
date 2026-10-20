import {
  RUN_ABOVE_KMH,
  WALK_BELOW_KMH,
  type InclineScale,
  type SessionDetail,
} from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import { Text } from '../../../components/text';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { useColour } from '../../../design/colour';
import { inclineText } from '../model/counters-model';
import {
  inclineAreaPath,
  inclineTop,
  MAX_PROFILE_POINTS,
  profileMax,
  profilePath,
  profileSummary,
  thinned,
  type ProfilePoint,
} from '../model/profile-model';
import { clockText } from '../model/treadmill-model';

const HEIGHT = 150;
const AXIS_FLOOR_KMH = 8;
const BAND_OPACITY = 0.14;
const INCLINE_OPACITY = 0.28;

function band(width: number, top: number, bottom: number): string {
  return `M0 ${top.toFixed(1)}H${String(width)}V${bottom.toFixed(1)}H0Z`;
}

function Bands({ width, yMax }: { readonly width: number; readonly yMax: number }): ReactNode {
  const walk = useColour('positive');
  const jog = useColour('caution');
  const run = useColour('viz-magenta');
  const at = (kmh: number): number => HEIGHT - (Math.min(kmh, yMax) / yMax) * HEIGHT;
  return (
    <>
      <Path d={band(width, at(WALK_BELOW_KMH), HEIGHT)} fill={walk} fillOpacity={BAND_OPACITY} />
      <Path
        d={band(width, at(RUN_ABOVE_KMH), at(WALK_BELOW_KMH))}
        fill={jog}
        fillOpacity={BAND_OPACITY}
      />
      <Path d={band(width, 0, at(RUN_ABOVE_KMH))} fill={run} fillOpacity={BAND_OPACITY} />
    </>
  );
}

function Plot({
  width,
  points,
  average,
}: {
  readonly width: number;
  readonly points: readonly ProfilePoint[];
  readonly average: number;
}): ReactNode {
  const stroke = useColour('on-surface');
  const dashed = useColour('on-surface-variant');
  const climb = useColour('viz-violet');
  const yMax = profileMax(points, AXIS_FLOOR_KMH);
  const top = inclineTop(points);
  const avgY = HEIGHT - (Math.min(average, yMax) / yMax) * HEIGHT;
  return (
    <Svg width={width} height={HEIGHT}>
      <Bands width={width} yMax={yMax} />
      {top === null ? null : (
        <Path
          d={inclineAreaPath(points, { width, height: HEIGHT, top: Math.max(top, 1) })}
          fill={climb}
          fillOpacity={INCLINE_OPACITY}
          stroke={climb}
          strokeWidth={1.5}
        />
      )}
      <Line
        x1={0}
        x2={width}
        y1={avgY}
        y2={avgY}
        stroke={dashed}
        strokeWidth={1}
        strokeDasharray="4 4"
      />
      <Path
        d={profilePath(points, { width, height: HEIGHT, yMax })}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function ProfileChart({
  detail,
  scale,
}: {
  readonly detail: SessionDetail;
  readonly scale: InclineScale;
}): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const points = thinned(
    detail.profile.map((sample) => ({ t: sample.t, kmh: sample.kmh, incline: sample.incline })),
    MAX_PROFILE_POINTS,
  );
  const last = points[points.length - 1];
  const top = inclineTop(points);
  return (
    <View className="gap-1">
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={profileSummary(detail, scale)}
        onLayout={onLayout}
      >
        {width > 0 ? <Plot width={width} points={points} average={detail.session.avgKmh} /> : null}
      </View>
      <View className="flex-row justify-between">
        <Text variant="caption" tone="faint">
          Start
        </Text>
        <Text variant="caption" tone="faint">
          Dashed line: average {detail.session.avgKmh.toFixed(1)} km/h
        </Text>
        <Text variant="caption" tone="faint" className="tabular">
          {last === undefined ? '' : clockText(last.t)}
        </Text>
      </View>
      {top === null ? null : (
        <Text variant="caption" tone="variant" className="tabular">
          Violet band: incline, up to {inclineText(top, scale)}
        </Text>
      )}
    </View>
  );
}
