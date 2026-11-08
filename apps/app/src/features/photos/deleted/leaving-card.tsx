import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg from 'react-native-svg';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { BarLabels, BarMarks } from '../../../components/charts/bar-marks';
import { Text } from '../../../components/text';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { useColour } from '../../../design/colour';
import { count } from '../../../format/number';
import { BARS_HEIGHT, leavingShapes } from './leaving-bars';
import {
  leavingLabel,
  monthLabel,
  totalsText,
  type DeletedTotals,
  type LeavingMonth,
} from './model';

function LeavingBars({ months }: { readonly months: readonly LeavingMonth[] }): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const critical = useColour('critical');
  const rest = useColour('track');
  const box = { height: BARS_HEIGHT };
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={leavingLabel(months)}
      className="gap-1"
    >
      <View style={box} onLayout={onLayout}>
        {width > 0 ? (
          <Svg width={width} height={BARS_HEIGHT}>
            <BarMarks shapes={leavingShapes(months, width, { critical, rest })} fill={rest} />
          </Svg>
        ) : null}
      </View>
      <BarLabels
        bars={months.map((month) => ({ key: month.key, label: monthLabel(month.key) }))}
        width={width}
      />
    </View>
  );
}

export interface WholeActions {
  readonly compact: boolean;
  readonly disabled: boolean;
  readonly onRestoreAll: () => void;
  readonly onDeleteAll: (() => void) | null;
}

function ActionRow({ actions }: { readonly actions: WholeActions }): ReactNode {
  const { compact } = actions;
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <Button
        label="Restore all"
        icon="archiveRestore"
        variant="tonal"
        grow={compact}
        disabled={actions.disabled}
        onPress={actions.onRestoreAll}
      />
      {actions.onDeleteAll === null ? null : (
        <>
          {compact ? null : <View className="mx-1 h-5 w-px bg-outline-variant" />}
          <Button
            label="Delete all now"
            icon="trash"
            variant="destructive"
            grow={compact}
            disabled={actions.disabled}
            onPress={actions.onDeleteAll}
          />
        </>
      )}
    </View>
  );
}

function InHere({ totals }: { readonly totals: DeletedTotals }): ReactNode {
  return (
    <View className="gap-0.5">
      <Text variant="caption" tone="variant">
        In here
      </Text>
      <Text variant="title-1" className="tabular-nums">
        {count(totals.count)}
      </Text>
      <Text variant="footnote" tone="variant" className="tabular-nums">
        {totalsText(totals)}
      </Text>
    </View>
  );
}

export function LeavingCard({
  totals,
  months,
  actions,
}: {
  readonly totals: DeletedTotals;
  readonly months: readonly LeavingMonth[];
  readonly actions: WholeActions;
}): ReactNode {
  return (
    <Card className="mb-1">
      <View className="flex-row flex-wrap items-end gap-x-6 gap-y-3">
        {actions.compact ? null : <InHere totals={totals} />}
        <View className="min-w-48 flex-1 gap-1">
          <Text variant="caption" tone="variant">
            Leaving for good per month
          </Text>
          <LeavingBars months={months} />
        </View>
      </View>
      <ActionRow actions={actions} />
    </Card>
  );
}
