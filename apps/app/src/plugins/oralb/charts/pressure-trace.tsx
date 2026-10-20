import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Text } from '../../../components/text';
import { useColour } from '../../../design/colour';
import { boxStyle } from '../../toothbrush/charts/style';
import { BAND_NAME, type BandLayout, type PressureBand } from '../model/gauge-model';
import { BAND_ROLE } from './force-gauge';
import { marginLeftStyle } from './style';

export const TRACE_HEIGHT = 56;
export const TRACE_LABEL_WIDTH = 58;
const PLOT_HEIGHT = TRACE_HEIGHT;
const LABEL_WIDTH = TRACE_LABEL_WIDTH;
const ROWS: readonly PressureBand[] = ['hard', 'good', 'light'];

function Backdrop({
  layout,
  width,
}: {
  readonly layout: BandLayout;
  readonly width: number;
}): ReactNode {
  const light = useColour(BAND_ROLE.light);
  const good = useColour(BAND_ROLE.good);
  const hard = useColour(BAND_ROLE.hard);
  const fills: Readonly<Record<PressureBand, string>> = { light, good, hard };
  return layout.spans.map((span) => {
    const top = PLOT_HEIGHT * (1 - span.to);
    const bottom = PLOT_HEIGHT * (1 - span.from);
    return (
      <Path
        key={span.band}
        d={`M0 ${top.toFixed(1)}H${width.toFixed(1)}V${bottom.toFixed(1)}H0Z`}
        fill={fills[span.band]}
        fillOpacity={0.14}
      />
    );
  });
}

export function PressureTrace({
  width,
  layout,
  path,
  label,
}: {
  readonly width: number;
  readonly layout: BandLayout;
  readonly path: string;
  readonly label: string;
}): ReactNode {
  const plotWidth = Math.max(0, width - LABEL_WIDTH);
  const line = useColour('on-surface');
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} className="gap-1">
      <View className="flex-row gap-2">
        <View
          aria-hidden
          style={boxStyle(LABEL_WIDTH - 8, PLOT_HEIGHT)}
          className="justify-between"
        >
          {ROWS.map((band) => (
            <Text key={band} variant="caption" tone="variant" numberOfLines={1}>
              {BAND_NAME[band]}
            </Text>
          ))}
        </View>
        <Svg aria-hidden width={plotWidth} height={PLOT_HEIGHT}>
          <Backdrop layout={layout} width={plotWidth} />
          <Path
            d={path}
            fill="none"
            stroke={line}
            strokeWidth={1.8}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </Svg>
      </View>
      <View aria-hidden style={marginLeftStyle(LABEL_WIDTH)} className="flex-row justify-between">
        <Text variant="caption" tone="faint">
          -60 s
        </Text>
        <Text variant="caption" tone="faint">
          now
        </Text>
      </View>
    </View>
  );
}
