import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../../design/cn';
import { Text } from '../text';

type StepBarState = 'done' | 'active' | 'waiting';

export interface StepBarStep {
  readonly label: string;
  readonly state: StepBarState;
}

const FILL: Readonly<Record<StepBarState, string>> = {
  done: 'bg-positive',
  active: 'bg-primary',
  waiting: 'bg-surface-3',
};

export function StepBar({ steps }: { readonly steps: readonly StepBarStep[] }): ReactNode {
  const index = Math.max(
    0,
    steps.findIndex((step) => step.state === 'active'),
  );
  const current = steps[index];
  return (
    <View
      role="progressbar"
      accessibilityLabel={`Step ${String(index + 1)} of ${String(steps.length)}`}
      className="gap-2"
    >
      <View className="flex-row gap-1.5">
        {steps.map((step) => (
          <View key={step.label} className={cn('h-2 flex-1 rounded-full', FILL[step.state])} />
        ))}
      </View>
      <Text variant="footnote" tone="variant">
        {`${String(index + 1)} of ${String(steps.length)}${current === undefined ? '' : ` · ${current.label}`}`}
      </Text>
    </View>
  );
}
