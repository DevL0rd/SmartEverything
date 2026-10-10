import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { cn } from '../design/cn';
import { Icon } from './icon';
import { Text } from './text';

type StepState = 'waiting' | 'active' | 'done' | 'failed';

export interface ProgressStep {
  readonly label: string;
  readonly state: StepState;
  readonly detail?: string;
}

function Marker({ state }: { readonly state: StepState }): ReactNode {
  if (state === 'active') {
    return <ActivityIndicator size="small" colorClassName="accent-primary" />;
  }
  return (
    <View
      className={cn(
        'size-6 items-center justify-center rounded-full',
        state === 'done' && 'bg-positive',
        state === 'failed' && 'bg-critical',
        state === 'waiting' && 'border-2 border-outline',
      )}
    >
      {state === 'done' ? <Icon name="check" size={16} tone="onPrimary" /> : null}
      {state === 'failed' ? <Icon name="close" size={16} tone="onPrimary" /> : null}
    </View>
  );
}

export function ProgressSteps({ steps }: { readonly steps: readonly ProgressStep[] }): ReactNode {
  return (
    <View accessibilityRole="list" className="gap-3">
      {steps.map((step) => (
        <View key={step.label} className="min-h-8 flex-row items-start gap-3">
          <View className="size-6 items-center justify-center">
            <Marker state={step.state} />
          </View>
          <View className="min-w-0 flex-1 gap-0.5">
            <Text variant="body" tone={step.state === 'waiting' ? 'faint' : 'default'}>
              {step.label}
            </Text>
            {step.detail === undefined ? null : (
              <Text variant="footnote" tone={step.state === 'failed' ? 'critical' : 'variant'}>
                {step.detail}
              </Text>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}
