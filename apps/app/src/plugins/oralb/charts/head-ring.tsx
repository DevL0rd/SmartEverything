import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Ellipse, G } from 'react-native-svg';
import { Arc } from '../../../components/charts';
import { Text } from '../../../components/text';
import { useColour } from '../../../design/colour';
import type { ColourRole } from '../../../design/tokens';
import { countdownLabel, type Countdown, type CountdownTone } from '../model/care-model';
import { boxStyle } from '../../toothbrush/charts/style';

const TONE_ROLE: Readonly<Record<CountdownTone, ColourRole>> = {
  positive: 'positive',
  warning: 'warning',
  critical: 'critical',
};

const BRISTLE = 'on-surface-variant';

const TUFTS: readonly (readonly [number, number])[] = [
  [20, 6],
  [27, 10],
  [28, 20],
  [20, 26],
  [12, 20],
  [13, 10],
  [20, 16],
];

export function HeadGlyph({
  tone,
  size,
}: {
  readonly tone: CountdownTone;
  readonly size: number;
}): ReactNode {
  const rim = useColour(TONE_ROLE[tone]);
  const bristle = useColour(BRISTLE);
  const plate = useColour('surface-3');
  return (
    <Svg aria-hidden width={size} height={size} viewBox="0 0 40 32">
      <G transform="rotate(-8 20 16)">
        <Ellipse cx={20} cy={16} rx={11} ry={14} fill={plate} stroke={rim} strokeWidth={1.8} />
        {TUFTS.map(([x, y]) => (
          <Circle key={`${String(x)}-${String(y)}`} cx={x} cy={y} r={2} fill={bristle} />
        ))}
      </G>
    </Svg>
  );
}

const RING_PX = 148;

export function HeadRing({ countdown }: { readonly countdown: Countdown | null }): ReactNode {
  const tone = countdown?.tone ?? 'positive';
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={countdownLabel(countdown)}
      style={boxStyle(RING_PX, RING_PX)}
      className="items-center justify-center"
    >
      <Arc
        value={countdown?.share ?? 0}
        size={RING_PX}
        thickness={10}
        colour={TONE_ROLE[tone]}
        tinted
      />
      <View aria-hidden className="absolute items-center gap-0.5">
        <HeadGlyph tone={tone} size={40} />
        <Text variant="title-3" className="tabular">
          {countdown?.big ?? 'Not read'}
        </Text>
        {countdown?.small === null || countdown === null ? null : (
          <Text variant="caption" tone="variant" align="center">
            {countdown.small}
          </Text>
        )}
      </View>
    </View>
  );
}
