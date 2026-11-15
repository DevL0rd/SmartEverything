import type { ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { PlannerSearchScreen } from '../../../../src/features/planner/search/search-screen';

export default function Route(): ReactNode {
  const { q } = useLocalSearchParams<{ q?: string }>();
  return <PlannerSearchScreen initial={q ?? ''} />;
}
