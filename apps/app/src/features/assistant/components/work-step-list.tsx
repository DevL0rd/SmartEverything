import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import type { Tone } from '../../../components/tone';
import { cn } from '../../../design/cn';
import { useMotion } from '../../../design/motion';
import { useForeground } from '../../../design/animation-gate';
import { SPIN, loopStyle } from '../../../design/loops';
import type { StepState, WorkStep } from '../model/work-steps';
import { Rise } from './rise';
import { RISE_MS, RISE_PX, STEP_STAGGER_MS, WORK_COLLAPSE } from './thread-motion';

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
  const { reduced } = useMotion();
  const foreground = useForeground();
  return (
    <Animated.View style={loopStyle({ name: SPIN, ms: 900 }, !reduced && foreground)}>
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

function StepRow({
  step,
  index,
  last,
}: {
  readonly step: WorkStep;
  readonly index: number;
  readonly last: boolean;
}): ReactNode {
  const failed = step.state === 'failed';
  return (
    <Rise
      from={RISE_PX.step}
      duration={RISE_MS.step}
      delay={index * STEP_STAGGER_MS}
      className="flex-row gap-3"
    >
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

function ReasoningRow({
  text,
  live,
  last,
}: {
  readonly text: string;
  readonly live: boolean;
  readonly last: boolean;
}): ReactNode {
  const motion = useMotion();
  const [open, setOpen] = useState(false);
  return (
    <Rise from={RISE_PX.step} duration={RISE_MS.step} className="flex-row gap-3">
      <Rail last={last}>
        {live ? <Spinner /> : <Icon name="sparkles" size={16} tone="positive" />}
      </Rail>
      <View className={cn('min-w-0 flex-1', last ? 'pb-0' : 'pb-3')}>
        <Interactive
          label={open ? 'Hide thinking' : 'Show thinking'}
          onPress={() => {
            setOpen(!open);
          }}
          className="min-h-touch-min flex-row items-center gap-1 self-start rounded-sm"
          layerClassName="rounded-sm"
        >
          <Text variant="callout">{live ? 'Thinking…' : 'Thought'}</Text>
          <Icon name={open ? 'chevronUp' : 'chevronDown'} size={16} tone="variant" />
        </Interactive>
        {open ? (
          <Animated.View
            {...(motion.reduced ? {} : { layout: WORK_COLLAPSE })}
            className="mt-1 border-l-2 border-outline-variant pl-3"
          >
            <Text variant="footnote" tone="variant" selectable>
              {text}
            </Text>
          </Animated.View>
        ) : null}
      </View>
    </Rise>
  );
}

export function WorkStepList({
  steps,
  reasoning,
  thinking,
}: {
  readonly steps: readonly WorkStep[];
  readonly reasoning: string;
  readonly thinking: boolean;
}): ReactNode {
  const hasReasoning = reasoning !== '';
  return (
    <View>
      <View className="h-hairline bg-outline-variant" />
      <View className="px-3 pb-3 pt-3">
        {hasReasoning ? (
          <ReasoningRow text={reasoning} live={thinking} last={steps.length === 0} />
        ) : null}
        {steps.map((step, index) => (
          <StepRow
            key={step.key}
            step={step}
            index={index + (hasReasoning ? 1 : 0)}
            last={index === steps.length - 1}
          />
        ))}
      </View>
    </View>
  );
}
