import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import { BarLabels, BarMarks, type BarShape } from '../../../components/charts/bar-marks';
import { barSlots, type BarSlot } from '../../../components/charts/bar-path';
import { Text } from '../../../components/text';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { useColour } from '../../../design/colour';
import type { SessionBars } from '../model/stats-model';
import { heightStyle } from './style';

const RADIUS = 3;
const GHOST_OPACITY = 0.3;
const GAP_SHARE = 0.25;
const AVERAGE_WIDTH = 1.6;
const GOAL_DASH = '5 4';

interface Plot {
  readonly width: number;
  readonly height: number;
  readonly peak: number;
}

function topOf(value: number, plot: Plot): number {
  return plot.height - (Math.max(0, value) / plot.peak) * plot.height;
}

function ghostShapes(bars: SessionBars, slots: readonly BarSlot[], plot: Plot): BarShape[] {
  return bars.bars.flatMap((bar, index): BarShape[] => {
    const slot = slots[index];
    if (slot === undefined || bar.ghost <= 0) {
      return [];
    }
    return [
      {
        key: `ghost-${bar.key}`,
        x: slot.x,
        width: slot.width,
        top: topOf(bar.ghost, plot),
        bottom: plot.height,
        radii: { top: RADIUS, bottom: 0 },
        opacity: GHOST_OPACITY,
      },
    ];
  });
}

type Part = 'morning' | 'evening' | 'other';

function partShapes(
  bars: SessionBars,
  slots: readonly BarSlot[],
  plot: Plot,
  part: Part,
): BarShape[] {
  return bars.bars.flatMap((bar, index): BarShape[] => {
    const slot = slots[index];
    const below =
      part === 'morning' ? 0 : part === 'evening' ? bar.morning : bar.morning + bar.evening;
    const value = bar[part];
    if (slot === undefined || value <= 0) {
      return [];
    }
    return [
      {
        key: `${part}-${bar.key}`,
        x: slot.x,
        width: slot.width,
        top: topOf(below + value, plot),
        bottom: topOf(below, plot),
        radii: {
          top:
            part === 'other' || below + value >= bar.morning + bar.evening + bar.other ? RADIUS : 0,
          bottom: 0,
        },
        opacity: 1,
      },
    ];
  });
}

function averagePath(values: readonly number[], slots: readonly BarSlot[], plot: Plot): string {
  return values
    .map((value, index) => {
      const slot = slots[index];
      return slot === undefined
        ? ''
        : `${index === 0 ? 'M' : 'L'}${(slot.x + slot.width / 2).toFixed(1)} ${topOf(value, plot).toFixed(1)}`;
    })
    .join(' ');
}

function Overlays({
  chart,
  plot,
  slots,
}: {
  readonly chart: SessionBars;
  readonly plot: Plot;
  readonly slots: readonly BarSlot[];
}): ReactNode {
  const average = useColour('on-surface');
  const goal = useColour('positive');
  const baseline = useColour('outline');
  const goalY = topOf(chart.goal, plot);
  return (
    <>
      {chart.goal > 0 ? (
        <Line
          x1={0}
          x2={plot.width}
          y1={goalY}
          y2={goalY}
          stroke={goal}
          strokeWidth={1.4}
          strokeDasharray={GOAL_DASH}
        />
      ) : null}
      {chart.average.length > 0 ? (
        <Path
          d={averagePath(chart.average, slots, plot)}
          fill="none"
          stroke={average}
          strokeWidth={AVERAGE_WIDTH}
          strokeOpacity={0.9}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null}
      <Line
        x1={0}
        x2={plot.width}
        y1={plot.height - 0.5}
        y2={plot.height - 0.5}
        stroke={baseline}
        strokeWidth={1}
      />
    </>
  );
}

function Layers({
  chart,
  plot,
  slots,
}: {
  readonly chart: SessionBars;
  readonly plot: Plot;
  readonly slots: readonly BarSlot[];
}): ReactNode {
  const morning = useColour('viz-2');
  const evening = useColour('viz-blue');
  const other = useColour('on-surface-variant');
  return (
    <>
      <BarMarks shapes={ghostShapes(chart, slots, plot)} fill={other} />
      <BarMarks shapes={partShapes(chart, slots, plot, 'morning')} fill={morning} />
      <BarMarks shapes={partShapes(chart, slots, plot, 'evening')} fill={evening} />
      <BarMarks shapes={partShapes(chart, slots, plot, 'other')} fill={other} />
      <Overlays chart={chart} plot={plot} slots={slots} />
    </>
  );
}

export function SessionBarsChart({
  chart,
  label,
  height = 120,
}: {
  readonly chart: SessionBars;
  readonly label: string;
  readonly height?: number;
}): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const plot: Plot = { width, height, peak: chart.peak };
  const slots = barSlots(chart.bars.length, width, { gap: GAP_SHARE, min: 1 });
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} className="gap-1">
      <View style={heightStyle(height)} onLayout={onLayout}>
        {width > 0 ? (
          <Svg width={width} height={height}>
            <Layers chart={chart} plot={plot} slots={slots} />
          </Svg>
        ) : null}
      </View>
      <BarLabels
        bars={chart.bars.map((bar) => ({ key: bar.key, label: bar.label }))}
        width={width}
      />
      <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
        <Key colour="viz-2" text="Morning" />
        <Key colour="viz-blue" text="Evening" />
        {chart.goal > 0 ? (
          <Key colour="positive" text={`Goal ${String(chart.goal)} a day`} dashed />
        ) : null}
        {chart.average.length > 0 ? <Key colour="on-surface" text="7 day average" line /> : null}
      </View>
    </View>
  );
}

function Key({
  colour,
  text,
  dashed = false,
  line = false,
}: {
  readonly colour: 'viz-2' | 'viz-blue' | 'positive' | 'on-surface';
  readonly text: string;
  readonly dashed?: boolean;
  readonly line?: boolean;
}): ReactNode {
  const stroke = useColour(colour);
  return (
    <View className="flex-row items-center gap-1.5">
      <Svg width={14} height={10}>
        {dashed || line ? (
          <Line
            x1={0}
            x2={14}
            y1={5}
            y2={5}
            stroke={stroke}
            strokeWidth={2}
            {...(dashed ? { strokeDasharray: '4 3' } : {})}
          />
        ) : (
          <Path d="M1 1h12v8H1z" fill={stroke} />
        )}
      </Svg>
      <Text variant="caption" tone="variant">
        {text}
      </Text>
    </View>
  );
}
