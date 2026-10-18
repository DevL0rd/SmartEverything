import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { Icon, type IconName } from '../../../components/icon';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { readinessLine, type SetupProgress, type SetupStep } from './setup-model';

function Gauge({ steps }: { readonly steps: readonly SetupStep[] }): ReactNode {
  const done = steps.filter((step) => step.state === 'done').length;
  return (
    <View
      role="img"
      accessibilityLabel={`${String(done)} of ${String(steps.length)} steps done`}
      className="flex-row gap-1.5"
    >
      {steps.map((step) => (
        <View key={step.id} className="flex-1 items-center gap-1.5">
          <View
            className={cn(
              'h-2.5 w-full rounded-full',
              step.state === 'done' ? 'bg-positive' : 'bg-surface-3',
            )}
          />
          <Icon name={step.icon} size={16} tone={step.state === 'done' ? 'positive' : 'faint'} />
        </View>
      ))}
    </View>
  );
}

function Node({
  icon,
  label,
  lit,
}: {
  readonly icon: IconName;
  readonly label: string;
  readonly lit: boolean;
}): ReactNode {
  return (
    <View
      className={cn(
        'flex-row items-center gap-1.5 rounded-full px-3 py-1.5',
        lit ? 'bg-positive/15' : 'bg-surface-2',
      )}
    >
      <Icon name={icon} size={16} tone={lit ? 'positive' : 'variant'} />
      <Text variant="caption" tone={lit ? 'positive' : 'variant'} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function Link({ lit }: { readonly lit: boolean }): ReactNode {
  return (
    <View
      className={cn(
        'h-0.5 min-w-3 flex-1 rounded-full',
        lit ? 'bg-positive' : 'bg-outline-variant',
      )}
    />
  );
}

function Flow({ ready }: { readonly ready: boolean }): ReactNode {
  return (
    <View
      role="img"
      accessibilityLabel="Side key opens the voice bar and starts a call"
      className="flex-row items-center gap-1.5"
    >
      <Node icon="power" label="Side key" lit={ready} />
      <Link lit={ready} />
      <Node icon="audioLines" label="Voice bar" lit={ready} />
      <Link lit={ready} />
      <Node icon="phone" label="Call" lit={ready} />
    </View>
  );
}

export function SetupHero({
  steps,
  progress,
}: {
  readonly steps: readonly SetupStep[];
  readonly progress: SetupProgress;
}): ReactNode {
  return (
    <Card>
      <View className="flex-row items-center gap-3">
        <View
          className={cn(
            'size-12 items-center justify-center rounded-full',
            progress.ready ? 'bg-positive/15' : 'bg-primary-container',
          )}
        >
          <Icon
            name={progress.ready ? 'circleCheck' : 'smartphone'}
            size={24}
            tone={progress.ready ? 'positive' : 'primary'}
          />
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <View className="flex-row items-baseline gap-1.5">
            <Text variant="title-1" className="tabular">
              {String(progress.done)}
            </Text>
            <Text variant="callout" tone="variant">
              {`of ${String(progress.total)} ready`}
            </Text>
          </View>
          <Text variant="footnote" tone="variant">
            {readinessLine(progress)}
          </Text>
        </View>
      </View>
      <Gauge steps={steps} />
      <Flow ready={progress.ready} />
    </Card>
  );
}
