import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { NutritionPref } from '@smarteverything/domain';
import { ProgressBar } from '../../../components/charts';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { withUnit } from '../../../format/number';
import type { DayTotals } from '../data/totals';
import { NUTRIENT_MACROS, amountText, goalOf, type MacroInfo } from '../model/macros';

export function macroAmountOf(macro: MacroInfo, value: number, goal: number | null): string {
  const shown = amountText(value, macro.unit);
  return withUnit(goal === null ? shown : `${shown} / ${amountText(goal, macro.unit)}`, macro.unit);
}

function MacroColumn({
  macro,
  value,
  goal,
}: {
  readonly macro: MacroInfo;
  readonly value: number;
  readonly goal: number | null;
}): ReactNode {
  return (
    <View className="min-w-0 flex-1 gap-1">
      <View className="flex-row items-center gap-1.5">
        <View className={cn('size-2.5 rounded-full', macro.dot)} />
        <Text variant="footnote" tone="variant" numberOfLines={1} className="shrink">
          {macro.label}
        </Text>
      </View>
      <Text variant="footnote" className="tabular">
        {macroAmountOf(macro, value, goal)}
      </Text>
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

export function MacroColumns({
  totals,
  prefs,
}: {
  readonly totals: DayTotals;
  readonly prefs: NutritionPref | null;
}): ReactNode {
  return (
    <View className="flex-row gap-3">
      {NUTRIENT_MACROS.map((macro) => (
        <MacroColumn
          key={macro.key}
          macro={macro}
          value={totals[macro.metric] ?? 0}
          goal={prefs === null ? null : goalOf(prefs, macro)}
        />
      ))}
    </View>
  );
}
