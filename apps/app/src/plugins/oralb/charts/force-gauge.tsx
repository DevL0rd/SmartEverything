import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedProps,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { arcPath } from '../../../components/charts/geometry';
import { Text } from '../../../components/text';
import { useColour } from '../../../design/colour';
import { SPRING, useMotion } from '../../../design/motion';
import { useScreenPaused } from '../../../design/screen-pause';
import type { ColourRole } from '../../../design/tokens';
import { boxStyle } from '../../toothbrush/charts/style';
import { BAND_NAME, LEARNING_NOTE, type BandLayout, type PressureBand } from '../model/gauge-model';

const AnimatedLine = Animated.createAnimatedComponent(Line);

export const BAND_ROLE: Readonly<Record<PressureBand, ColourRole>> = {
  light: 'on-surface-variant',
  good: 'positive',
  hard: 'critical',
};

const THICKNESS = 12;
const PAD = THICKNESS / 2 + 2;
const NEEDLE_REACH = 0.78;

export function gaugeHeight(width: number): number {
  return Math.round(width / 2) + PAD + 4;
}

function Band({
  from,
  to,
  band,
  ring,
  learned,
}: {
  readonly from: number;
  readonly to: number;
  readonly band: PressureBand;
  readonly ring: { readonly cx: number; readonly cy: number; readonly r: number };
  readonly learned: boolean;
}): ReactNode {
  const stroke = useColour(BAND_ROLE[band]);
  if (to <= from) {
    return null;
  }
  return (
    <Path
      d={arcPath(ring, -90 + 180 * from, -90 + 180 * to)}
      fill="none"
      stroke={stroke}
      strokeOpacity={learned ? 0.95 : 0.7}
      strokeWidth={THICKNESS}
      strokeLinecap="butt"
      {...(learned ? {} : { strokeDasharray: '5 4' })}
    />
  );
}

function useNeedle(share: number): SharedValue<number> {
  const reduced = useMotion().reduced;
  const paused = useScreenPaused();
  const degrees = useSharedValue(-90 + 180 * share);
  useEffect(() => {
    const target = -90 + 180 * share;
    if (paused) {
      cancelAnimation(degrees);
      return;
    }
    degrees.set(reduced ? target : withSpring(target, SPRING));
  }, [degrees, share, reduced, paused]);
  return degrees;
}

function Needle({
  share,
  cx,
  cy,
  length,
  colour,
}: {
  readonly share: number;
  readonly cx: number;
  readonly cy: number;
  readonly length: number;
  readonly colour: string;
}): ReactNode {
  const degrees = useNeedle(share);
  const animated = useAnimatedProps(() => {
    const radians = ((degrees.get() - 90) * Math.PI) / 180;
    return { x2: cx + length * Math.cos(radians), y2: cy + length * Math.sin(radians) };
  }, [cx, cy, length]);
  return (
    <AnimatedLine
      x1={cx}
      y1={cy}
      x2={cx}
      y2={cy - length}
      stroke={colour}
      strokeWidth={3}
      strokeLinecap="round"
      animatedProps={animated}
    />
  );
}

function BandNames({
  layout,
  band,
}: {
  readonly layout: BandLayout;
  readonly band: PressureBand | null;
}): ReactNode {
  return (
    <View aria-hidden className="flex-row items-start justify-between">
      {layout.spans.map((span) => (
        <Text
          key={span.band}
          variant="caption"
          tone={span.band === band ? 'default' : 'variant'}
          className={span.band === band ? 'font-sans-semibold' : ''}
        >
          {BAND_NAME[span.band]}
        </Text>
      ))}
    </View>
  );
}

function Face({
  width,
  layout,
  share,
  band,
}: {
  readonly width: number;
  readonly layout: BandLayout;
  readonly share: number;
  readonly band: PressureBand | null;
}): ReactNode {
  const radius = width / 2 - PAD;
  const ring = { cx: width / 2, cy: radius + PAD, r: radius };
  const ink = useColour('on-surface');
  const state = useColour(band === null ? 'on-surface' : BAND_ROLE[band]);
  const hub = useColour('bg');
  const needle = layout.learned ? ink : state;
  return (
    <Svg width={width} height={gaugeHeight(width)} aria-hidden>
      {layout.spans.map((span) => (
        <Band
          key={span.band}
          from={span.from}
          to={span.to}
          band={span.band}
          ring={ring}
          learned={layout.learned}
        />
      ))}
      <Needle
        share={share}
        cx={ring.cx}
        cy={ring.cy}
        length={radius * NEEDLE_REACH}
        colour={needle}
      />
      <Circle cx={ring.cx} cy={ring.cy} r={5} fill={needle} stroke={hub} strokeWidth={1.5} />
    </Svg>
  );
}

export function ForceGauge({
  width,
  layout,
  share,
  band,
  label,
}: {
  readonly width: number;
  readonly layout: BandLayout;
  readonly share: number;
  readonly band: PressureBand | null;
  readonly label: string;
}): ReactNode {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={boxStyle(width, gaugeHeight(width) + 22)}
      className="gap-1"
    >
      <Face width={width} layout={layout} share={share} band={band} />
      <BandNames layout={layout} band={band} />
      {layout.learned ? null : (
        <Text variant="caption" tone="faint" align="center">
          {LEARNING_NOTE}
        </Text>
      )}
    </View>
  );
}
