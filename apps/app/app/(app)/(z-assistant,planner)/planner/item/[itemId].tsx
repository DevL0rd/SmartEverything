import type { ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ItemScreen } from '../../../../../src/features/planner/item';

export default function Route(): ReactNode {
  const { itemId, occurrence } = useLocalSearchParams<{ itemId: string; occurrence?: string }>();
  return <ItemScreen itemId={itemId} occurrenceKey={occurrence ?? null} />;
}
