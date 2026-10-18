import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Icon, type IconName } from '../../../components/icon';
import { Text } from '../../../components/text';
import type { Tone } from '../../../components/tone';
import { cn } from '../../../design/cn';
import { useAnimationGate } from '../../../design/animation-gate';
import { useScopeVisible } from '../../../design/visibility';
import { SPIN, loopStyle } from '../../../design/loops';
import type { StepState, WorkStep } from '../model/work-steps';
import { Rise } from './rise';
import { RISE_MS, RISE_PX } from './thread-motion';

const STATE_ICON: Readonly<Record<Exclude<StepState, 'running'>, IconName>> = {
  done: 'check',
  failed: 'alert',
  retried: 'refresh',
};

const STATE_TONE: Readonly<Record<StepState, Tone>> = {
  running: 'primary',
  done: 'positive',
  failed: 'critical',
  retried: 'variant',
};

export function Spinner({ tone = 'primary' }: { readonly tone?: Tone }): ReactNode {
  const { moving } = useAnimationGate(true, useScopeVisible());
  return (
    <Animated.View style={loopStyle({ name: SPIN, ms: 900 }, moving)}>
      <Icon name="loader" size={16} tone={tone} />
    </Animated.View>
  );
}

function StepGlyph({ state }: { readonly state: StepState }): ReactNode {
  return state === 'running' ? (
    <Spinner />
  ) : (
    <Icon name={STATE_ICON[state]} size={16} tone={STATE_TONE[state]} />
  );
}

function Rail({
  last,
  children,
}: {
  readonly last: boolean;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View className="w-8 items-center">
      <View className="h-5 items-center justify-center">{children}</View>
      {last ? null : <View className="mt-1 w-px flex-1 bg-outline-variant" />}
    </View>
  );
}

function StepRow({ step, last }: { readonly step: WorkStep; readonly last: boolean }): ReactNode {
  const failed = step.state === 'failed';
  return (
    <Rise from={RISE_PX.step} duration={RISE_MS.step} className="flex-row gap-3">
      <Rail last={last}>
        <StepGlyph state={step.state} />
      </Rail>
      <View className={cn('min-w-0 flex-1', last ? 'pb-0' : 'pb-3')}>
        <Text variant="callout" tone={failed ? 'critical' : 'default'}>
          {step.title}
        </Text>
        {step.detail === null || step.detail === '' ? null : (
          <Text variant="footnote" tone={failed ? 'critical' : 'variant'}>
            {step.detail}
          </Text>
        )}
      </View>
    </Rise>
  );
}

export function WorkStepList({ steps }: { readonly steps: readonly WorkStep[] }): ReactNode {
  return (
    <View>
      <View className="h-hairline bg-outline-variant" />
      <View className="px-3 pb-3 pt-3">
        {steps.map((step, index) => (
          <StepRow key={step.key} step={step} last={index === steps.length - 1} />
        ))}
      </View>
    </View>
  );
}
