import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import type { StatusTone } from '../../../components/tone';

export type TaskPriority = 1 | 2 | 3;

const PRIORITY_TONE: Readonly<Record<TaskPriority, StatusTone>> = {
  1: 'critical',
  2: 'warning',
  3: 'info',
};

export const PRIORITY_RING: Readonly<Record<TaskPriority, string>> = {
  1: 'border-critical',
  2: 'border-warning',
  3: 'border-info',
};

export function priorityOf(value: number | null): TaskPriority | null {
  return value === 1 || value === 2 || value === 3 ? value : null;
}

export function PriorityFlag({ priority }: { readonly priority: TaskPriority }): ReactNode {
  return (
    <View accessible accessibilityLabel={`Priority ${String(priority)}`} className="shrink-0">
      <Badge label={String(priority)} tone={PRIORITY_TONE[priority]} icon="flag" />
    </View>
  );
}
