import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Text } from '../../../components/text';
import { useColour } from '../../../design/colour';
import { sectorPath } from '../model/mouth-model';
import type { RadialBin } from '../model/stats-model';

const SIZE = 200;
const INNER = 0.38;
const OUTER = 0.96;
const GAP_DEGREES = 1.2;

function wedge(bin: RadialBin, peak: number): string {
  const centre = SIZE / 2;
  const share = peak === 0 ? 0 : bin.value / peak;
  const outer = centre * (INNER + (OUTER - INNER) * Math.max(share, 0.04));
  const from = 90 - bin.hour * 15 - GAP_DEGREES;
  const to = from - 15 + 2 * GAP_DEGREES;
  return sectorPath({ cx: centre, cy: centre, inner: centre * INNER, outer, from, to });
}

export function RadialHistogram({
  bins,
  label,
}: {
  readonly bins: readonly RadialBin[];
  readonly label: string;
}): ReactNode {
  const morning = useColour('viz-2');
  const evening = useColour('viz-blue');
  const other = useColour('on-surface-variant');
  const track = useColour('outline-variant');
  const peak = Math.max(0, ...bins.map((bin) => bin.value));
  const fill = { morning, evening, other } as const;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      className="items-center gap-2"
    >
      <Svg width={SIZE} height={SIZE}>
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={(SIZE / 2) * INNER}
          fill="none"
          stroke={track}
          strokeWidth={1}
        />
        {bins.map((bin) => (
          <Path
            key={bin.hour}
            d={wedge(bin, peak)}
            fill={fill[bin.part]}
            fillOpacity={bin.value === 0 ? 0.25 : 1}
          />
        ))}
      </Svg>
      <View className="flex-row justify-between self-stretch px-8">
        <Text variant="caption" tone="faint">
          Midnight at the top, noon at the bottom
        </Text>
      </View>
    </View>
  );
}
