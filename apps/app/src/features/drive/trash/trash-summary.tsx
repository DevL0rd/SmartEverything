import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { Card } from '../../../components/card';
import { BarLabels, BarMarks } from '../../../components/charts/bar-marks';
import { Swatch } from '../../../components/charts/chart-legend';
import { Text } from '../../../components/text';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { cn } from '../../../design/cn';
import { useColour } from '../../../design/colour';
import { bytes, count } from '../../../format/number';
import { plural } from '../../../format/text';
import { deletedByLabel, type DeletedByShare } from './deleted-by';
import {
  BARS_HEIGHT,
  leavingLabel,
  leavingShapes,
  leavingTotals,
  type LeavingMonth,
} from './leaving-bars';
import { useToneColour } from './tone-colour';
import { monthLabel } from './trash-model';

const PLOT_BOX = { height: BARS_HEIGHT } as const;

function Piece({
  share,
  colour,
}: {
  readonly share: DeletedByShare;
  readonly colour: string;
}): ReactNode {
  const paint: ViewStyle = { flexGrow: share.count, flexBasis: 0, backgroundColor: colour };
  return <View style={paint} className="h-full" />;
}

function Dot({ colour }: { readonly colour: string }): ReactNode {
  const fill = { backgroundColor: colour };
  return <View aria-hidden style={fill} className="size-2 rounded-full" />;
}

const SIDE_BY_SIDE = 'min-w-0 flex-1';

export function DeletedByCard({
  shares,
  wide,
}: {
  readonly shares: readonly DeletedByShare[];
  readonly wide: boolean;
}): ReactNode {
  const colourOf = useToneColour();
  return (
    <Card {...(wide ? { className: SIDE_BY_SIDE } : {})} label={deletedByLabel(shares)}>
      <Text variant="caption" tone="variant">
        Deleted by
      </Text>
      <View
        aria-hidden
        className="h-2 w-full flex-row gap-0.5 overflow-hidden rounded-full bg-surface-3"
      >
        {shares.map((share) => (
          <Piece key={share.key} share={share} colour={colourOf(share.tone)} />
        ))}
      </View>
      <View aria-hidden className="flex-row flex-wrap gap-x-4 gap-y-1">
        {shares.map((share) => (
          <View key={share.key} className="flex-row items-center gap-1.5">
            <Dot colour={colourOf(share.tone)} />
            <Text variant="footnote" tone="variant" numberOfLines={1}>
              {share.label}
            </Text>
            <Text variant="footnote" className="tabular">
              {count(share.count)}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

function LeavingPlot({ months }: { readonly months: readonly LeavingMonth[] }): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const trash = useColour('track');
  const versions = useColour('info');
  const baseline = useColour('outline');
  const shapes = width > 0 ? leavingShapes(months, width, { trash, versions }) : [];
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={leavingLabel(months)}>
      <View style={PLOT_BOX} onLayout={onLayout}>
        {width > 0 ? (
          <Svg width={width} height={BARS_HEIGHT}>
            <BarMarks shapes={shapes} fill={trash} />
            <Line
              x1={0}
              x2={width}
              y1={BARS_HEIGHT - 0.5}
              y2={BARS_HEIGHT - 0.5}
              stroke={baseline}
              strokeWidth={1}
            />
          </Svg>
        ) : null}
      </View>
      <BarLabels
        bars={months.map((month) => ({ key: month.month, label: monthLabel(month.month) }))}
        width={width}
      />
    </View>
  );
}

function LeavingLegend({ months }: { readonly months: readonly LeavingMonth[] }): ReactNode {
  const totals = leavingTotals(months);
  const entries = [
    { key: 'trash', label: 'Trash', colour: 'track', value: totals.trash },
    { key: 'versions', label: 'Old versions', colour: 'info', value: totals.versions },
  ] as const;
  return (
    <View aria-hidden className="flex-row flex-wrap gap-x-4 gap-y-1">
      {entries.map((entry) => (
        <View key={entry.key} className="flex-row items-center gap-1.5">
          <Swatch colour={entry.colour} />
          <Text variant="footnote" tone="variant">
            {entry.label}
          </Text>
          <Text variant="footnote" className="tabular">
            {bytes(entry.value)}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function LeavingCard({
  months,
  wide,
}: {
  readonly months: readonly LeavingMonth[];
  readonly wide: boolean;
}): ReactNode {
  return (
    <Card {...(wide ? { className: SIDE_BY_SIDE } : {})}>
      <View className="flex-row items-center justify-between gap-2">
        <Text variant="caption" tone="variant">
          Leaving each month
        </Text>
        <Text variant="caption" tone="variant" className="tabular">
          {`next ${plural(months.length, 'month')}`}
        </Text>
      </View>
      <LeavingPlot months={months} />
      <LeavingLegend months={months} />
    </Card>
  );
}

export function TrashSummary({
  shares,
  months,
  wide,
}: {
  readonly shares: readonly DeletedByShare[];
  readonly months: readonly LeavingMonth[] | null;
  readonly wide: boolean;
}): ReactNode {
  return (
    <View className={cn('gap-3', wide && 'flex-row items-stretch')}>
      <DeletedByCard shares={shares} wide={wide} />
      {months === null || months.length === 0 ? null : <LeavingCard months={months} wide={wide} />}
    </View>
  );
}
