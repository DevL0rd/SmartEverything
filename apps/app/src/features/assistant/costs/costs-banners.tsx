import type { ReactNode } from 'react';
import { View } from 'react-native';
import { MoneyNoticeBanner } from '../../region';
import { BudgetBanner } from './budget-banner';

export function CostsBanners(): ReactNode {
  return (
    <View className="gap-2">
      <BudgetBanner />
      <MoneyNoticeBanner />
    </View>
  );
}
