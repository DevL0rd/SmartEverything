import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { runSetupAction } from './setup-actions';
import type { SetupProgress, SetupStep } from './setup-model';
import { SetupStepCard } from './setup-step-card';

export function SetupList({
  steps,
  progress,
}: {
  readonly steps: readonly SetupStep[];
  readonly progress: SetupProgress;
}): ReactNode {
  return (
    <Card title="One-time setup" icon="settings">
      <View className="gap-2">
        {steps.map((step) => (
          <SetupStepCard
            key={step.id}
            step={step}
            next={progress.next?.id === step.id}
            onAction={runSetupAction}
          />
        ))}
      </View>
    </Card>
  );
}
