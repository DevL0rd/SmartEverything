import type { ReactNode } from 'react';
import { View } from 'react-native';
import { BudgetBanner } from '../costs/budget-banner';
import { pausedText, useBudgetStatus } from '../data/budget';
export function ThreadBanners(): ReactNode {
  const budget = useBudgetStatus().data;
  if (budget === undefined || pausedText(budget) === null) return null;
  return (
    <View className="py-2">
      <BudgetBanner />
    </View>
  );
}
