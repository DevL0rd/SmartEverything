import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { NutritionPref } from '@smarteverything/domain';
import { ProgressBar } from '../../../components/charts';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { withUnit } from '../../../format/number';
import type { DayTotals } from '../data/totals';
import { NUTRIENT_MACROS, amountText, goalOf, type MacroInfo } from '../model/macros';

function MacroRow({
  macro,
  value,
  goal,
  compact,
}: {
  readonly macro: MacroInfo;
  readonly value: number;
  readonly goal: number | null;
  readonly compact: boolean;
}): ReactNode {
  const amount = withUnit(
    `${amountText(value, macro.unit)}${goal === null ? '' : ` / ${amountText(goal, macro.unit)}`}`,
    macro.unit,
  );
  return (
    <View className="gap-1">
      <View className="flex-row items-center gap-2">
        <View className={cn('size-2.5 rounded-full', macro.dot)} />
        <Text
          variant={compact ? 'footnote' : 'callout'}
          tone="variant"
          numberOfLines={1}
          className="flex-1"
        >
          {macro.label}
        </Text>
        <Text variant={compact ? 'footnote' : 'callout'} className="tabular" numberOfLines={1}>
          {amount}
        </Text>
      </View>
      {goal === null ? null : (
        <ProgressBar
          progress={value / goal}
          colour={value > goal * 1.1 ? 'warning' : macro.colour}
          label={macro.label}
          thick
        />
      )}
    </View>
  );
}

export function MacroList({
  totals,
  prefs,
  compact = false,
}: {
  readonly totals: DayTotals;
  readonly prefs: NutritionPref | null;
  readonly compact?: boolean;
}): ReactNode {
  return (
    <View className={compact ? 'gap-1.5' : 'gap-3'}>
      {NUTRIENT_MACROS.map((macro) => (
        <MacroRow
          key={macro.key}
          macro={macro}
          value={totals[macro.metric] ?? 0}
          goal={prefs === null ? null : goalOf(prefs, macro)}
          compact={compact}
        />
      ))}
    </View>
  );
}
