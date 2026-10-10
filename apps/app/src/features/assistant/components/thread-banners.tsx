import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Banner } from '../../../components/banner';
import { useSyncStatus } from '../../../store/selectors';
import { BudgetBanner } from '../costs/budget-banner';
import { pausedText, useBudgetStatus } from '../data/budget';

export function ThreadBanners(): ReactNode {
  const interrupted = useSyncStatus().status === 'interrupted';
  const budget = useBudgetStatus().data;
  const paused = budget !== undefined && pausedText(budget) !== null;
  if (!interrupted && !paused) {
    return null;
  }
  return (
    <View className="gap-2 py-2">
      {interrupted ? (
        <Banner
          tone="info"
          title="Your server can’t be reached"
          body="You can keep writing. Replies arrive when it’s back."
          wrapBody
        />
      ) : null}
      <BudgetBanner />
    </View>
  );
}
