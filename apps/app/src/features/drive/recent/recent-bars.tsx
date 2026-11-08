import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { Card } from '../../../components/card';
import { BarLabels, BarMarks } from '../../../components/charts/bar-marks';
import { Swatch } from '../../../components/charts/chart-legend';
import { Text } from '../../../components/text';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { useColour } from '../../../design/colour';
import type { ColourRole } from '../../../design/tokens';
import { count } from '../../../format/number';
import { dayLabelOf, type ChartFilter, type RecentDay } from './recent-model';
import { PLOT_HEIGHT, stackShapesOf } from './recent-stack';

const PLOT_BOX = { height: PLOT_HEIGHT } as const;
const ADDED: ColourRole = 'primary';
const CHANGED: ColourRole = 'info';

function Stack({ days }: { readonly days: readonly RecentDay[] }): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const added = useColour(ADDED);
  const changed = useColour(CHANGED);
  const baseline = useColour('outline');
  const shapes = width > 0 ? stackShapesOf(days, width, changed) : [];
  return (
    <View className="gap-1">
      <View style={PLOT_BOX} onLayout={onLayout}>
        {width > 0 ? (
          <Svg width={width} height={PLOT_HEIGHT}>
            <BarMarks shapes={shapes} fill={added} />
            <Line
              x1={0}
              x2={width}
              y1={PLOT_HEIGHT - 0.5}
              y2={PLOT_HEIGHT - 0.5}
              stroke={baseline}
              strokeWidth={1}
            />
          </Svg>
        ) : null}
      </View>
      <BarLabels
        bars={days.map((day) => ({ key: day.day, label: dayLabelOf(day.day) }))}
        width={width}
      />
    </View>
  );
}

interface LegendEntry {
  readonly label: string;
  readonly colour: ColourRole;
  readonly value: number;
}

function Legend({ entries }: { readonly entries: readonly LegendEntry[] }): ReactNode {
  return (
    <View aria-hidden className="flex-row flex-wrap gap-x-4 gap-y-1">
      {entries.map((entry) => (
        <View key={entry.label} className="flex-row items-center gap-1.5">
          <Swatch colour={entry.colour} />
          <Text variant="footnote" tone="variant">
            {entry.label}
          </Text>
          <Text variant="footnote" className="tabular">
            {count(entry.value)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const SUMMARY: Readonly<Record<ChartFilter, string>> = {
  everything: 'added or changed this week',
  added: 'added this week',
  changed: 'changed this week',
};

export interface RecentBarsProps {
  readonly filter: ChartFilter;
  readonly days: readonly RecentDay[];
}

function legendOf(props: RecentBarsProps, added: number, changed: number): LegendEntry[] {
  return [
    ...(props.filter === 'changed' ? [] : [{ label: 'Added', colour: ADDED, value: added }]),
    ...(props.filter === 'added' ? [] : [{ label: 'Changed', colour: CHANGED, value: changed }]),
  ];
}

export function RecentBars(props: RecentBarsProps): ReactNode {
  const added = props.days.reduce((sum, day) => sum + day.added, 0);
  const changed = props.days.reduce((sum, day) => sum + day.changed, 0);
  const total = added + changed;
  const summary = `${count(total)} ${total === 1 ? 'file' : 'files'} ${SUMMARY[props.filter]}`;
  return (
    <Card label={`Files per day this week, stacked by added and changed. ${summary}`}>
      <View className="gap-1">
        <Text variant="footnote" tone="variant">
          This week
        </Text>
        <Text variant="title-2" className="tabular">
          {count(total)}
        </Text>
        <Text variant="footnote" tone="variant">
          {`${total === 1 ? 'file' : 'files'} ${SUMMARY[props.filter]}`}
        </Text>
      </View>
      <View accessible accessibilityRole="image" accessibilityLabel={summary}>
        <Stack days={props.days} />
      </View>
      <Legend entries={legendOf(props, added, changed)} />
    </Card>
  );
}
