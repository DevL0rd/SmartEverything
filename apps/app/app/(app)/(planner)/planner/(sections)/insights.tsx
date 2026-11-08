import type { ReactNode } from 'react';
import { View } from 'react-native';
import { EmptyState } from '../../../../../src/components/empty-state';

export default function Route(): ReactNode {
  return (
    <View className="flex-1 justify-center">
      <EmptyState icon="trendUp" title="Insights" body="Your planner insights will be here." />
    </View>
  );
}
