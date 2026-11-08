import type { ReactNode } from 'react';
import { View } from 'react-native';
import { EmptyState } from '../../../../../src/components/empty-state';

export default function Route(): ReactNode {
  return (
    <View className="flex-1 justify-center">
      <EmptyState icon="activity" title="Activity" body="Changes to your files will be here." />
    </View>
  );
}
