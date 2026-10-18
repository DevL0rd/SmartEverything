import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge, type BadgeTone } from '../../../components/badge';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import type { SetupState, SetupStep } from './setup-model';

const BADGE: Readonly<Record<SetupState, { readonly label: string; readonly tone: BadgeTone }>> = {
  done: { label: 'Done', tone: 'positive' },
  todo: { label: 'To do', tone: 'neutral' },
  unknown: { label: 'Needs an app update', tone: 'warning' },
};

function Marker({ step, next }: { readonly step: SetupStep; readonly next: boolean }): ReactNode {
  if (step.state === 'done') {
    return (
      <View className="size-10 items-center justify-center rounded-full bg-positive">
        <Icon name="check" size={20} tone="onPrimary" />
      </View>
    );
  }
  if (next) {
    return (
      <View className="size-10 items-center justify-center rounded-full bg-primary">
        <Icon name={step.icon} size={20} tone="onPrimary" />
      </View>
    );
  }
  return (
    <View className="size-10 items-center justify-center rounded-full border-2 border-outline">
      <Icon name={step.icon} size={20} tone={step.state === 'unknown' ? 'warning' : 'variant'} />
    </View>
  );
}

export function SetupStepCard({
  step,
  next,
  onAction,
}: {
  readonly step: SetupStep;
  readonly next: boolean;
  readonly onAction: (kind: SetupStep['actions'][number]['kind']) => void;
}): ReactNode {
  const badge =
    next && step.state === 'todo' ? { label: 'Next', tone: 'primary' as const } : BADGE[step.state];
  return (
    <View
      className={cn(
        'gap-3 rounded-lg px-4 py-3',
        next ? 'border border-primary/40 bg-primary-container/30' : 'bg-surface-2',
      )}
    >
      <View className="flex-row items-start gap-3">
        <Marker step={step} next={next} />
        <View className="min-w-0 flex-1 gap-1">
          <View className="flex-row items-center justify-between gap-2">
            <Text variant="body-strong" className="min-w-0 flex-1">
              {step.title}
            </Text>
            <Badge label={badge.label} tone={badge.tone} />
          </View>
          <Text variant="footnote" tone="variant">
            {step.body}
          </Text>
        </View>
      </View>
      {step.actions.length === 0 ? null : (
        <View className="flex-row flex-wrap gap-2 pl-13">
          {step.actions.map((action, index) => (
            <Button
              key={action.kind}
              label={action.label}
              variant={index === 0 ? (next ? 'filled' : 'tonal') : 'text'}
              onPress={() => {
                onAction(action.kind);
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}
