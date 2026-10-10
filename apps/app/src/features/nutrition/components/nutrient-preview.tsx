import type { ReactNode } from 'react';
import { View } from 'react-native';
import { portionOf, type FoodCandidate } from '@smarteverything/domain';
import { Figure } from '../../../components/figure';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { NUTRIENT_MACROS, amountText } from '../model/macros';
import { millilitres } from '../../../format/number';

export function NutrientPreview({
  food,
  amount,
}: {
  readonly food: FoodCandidate;
  readonly amount: number;
}): ReactNode {
  const portion = portionOf(food, amount);
  return (
    <View className="gap-3">
      <View className="flex-row items-end justify-between gap-4">
        {portion.kilocalories === null ? (
          <Text variant="callout" tone="warning">
            No calories known for this food
          </Text>
        ) : (
          <Figure value={amountText(portion.kilocalories, 'kcal')} unit="kcal" size="l" />
        )}
        <View className="flex-row gap-4">
          {NUTRIENT_MACROS.map((macro) => {
            const grams = macro.nutrient === null ? undefined : portion.grams[macro.nutrient];
            return (
              <View key={macro.key} className="items-end">
                <View className="flex-row items-center gap-1">
                  <View className={cn('size-2 rounded-full', macro.dot)} />
                  <Text variant="caption" tone="variant">
                    {macro.label}
                  </Text>
                </View>
                <Text variant="callout" className="tabular">
                  {grams === undefined ? '—' : `${amountText(grams, 'g')} g`}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
      {portion.waterMl > 0 ? (
        <Text variant="footnote" tone="variant">
          {`Counts ${millilitres(portion.waterMl)} toward water`}
        </Text>
      ) : null}
    </View>
  );
}
