import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { Card } from '../../../components/card';
import { BarLabels, BarMarks } from '../../../components/charts/bar-marks';
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
  leavingTotalOf,
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

const SIDE_BY_SIDE = 'min-w-0 flex-1 justify-between';

function CardCaption({
  title,
  value,
}: {
  readonly title: string;
  readonly value: string;
}): ReactNode {
  return (
    <View className="flex-row items-center justify-between gap-2">
      <Text variant="caption" tone="variant" numberOfLines={1} className="min-w-0 shrink">
        {title}
      </Text>
      <Text variant="caption" tone="variant" numberOfLines={1} className="tabular shrink-0">
        {value}
      </Text>
    </View>
  );
}

export function DeletedByCard({
  shares,
  wide,
}: {
  readonly shares: readonly DeletedByShare[];
  readonly wide: boolean;
}): ReactNode {
  const colourOf = useToneColour();
  const total = shares.reduce((sum, share) => sum + share.count, 0);
  return (
    <Card {...(wide ? { className: SIDE_BY_SIDE } : {})} label={deletedByLabel(shares)}>
      <View className="gap-1">
        <Text variant="caption" tone="variant">
          Deleted by
        </Text>
        <Text variant="title-3" className="tabular">
          {plural(total, 'item')}
        </Text>
      </View>
      <View className="gap-3">
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
      </View>
    </Card>
  );
}

const TRASH_COLOUR = 'track';

function LeavingPlot({ months }: { readonly months: readonly LeavingMonth[] }): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const trash = useColour(TRASH_COLOUR);
  const baseline = useColour('outline');
  const shapes = width > 0 ? leavingShapes(months, width, trash) : [];
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

export function LeavingCard({
  months,
  wide,
}: {
  readonly months: readonly LeavingMonth[];
  readonly wide: boolean;
}): ReactNode {
  return (
    <Card {...(wide ? { className: SIDE_BY_SIDE } : {})}>
      <View className="gap-1">
        <CardCaption title="Leaving each month" value={`next ${plural(months.length, 'month')}`} />
        <Text variant="title-3" className="tabular">
          {bytes(leavingTotalOf(months))}
        </Text>
      </View>
      <LeavingPlot months={months} />
    </Card>
  );
}

export function TrashSummary({
  shares,
  months,
  wide,
}: {
  readonly shares: readonly DeletedByShare[];
  readonly months: readonly LeavingMonth[];
  readonly wide: boolean;
}): ReactNode {
  return (
    <View className={cn('gap-3', wide && 'flex-row items-stretch')}>
      <DeletedByCard shares={shares} wide={wide} />
      {months.length === 0 ? null : <LeavingCard months={months} wide={wide} />}
    </View>
  );
}
