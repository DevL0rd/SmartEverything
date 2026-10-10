import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import type { Tone } from '../../../components/tone';
import { plural } from '../../../format/text';
import { useAssistantStatus } from '../data/assistant-data';

export interface WorkStep {
  readonly key: string;
  readonly title: string;
  readonly state: 'running' | 'done' | 'failed';
}

const STEP_ICON: Readonly<Record<WorkStep['state'], IconName>> = {
  running: 'loader',
  done: 'check',
  failed: 'alert',
};

const STEP_TONE: Readonly<Record<WorkStep['state'], Tone>> = {
  running: 'primary',
  done: 'faint',
  failed: 'critical',
};

export function stepsOf(titles: readonly string[], live: boolean): readonly WorkStep[] {
  return titles.map((title, index) => ({
    key: String(index),
    title,
    state: live && index === titles.length - 1 ? 'running' : 'done',
  }));
}

function summaryOf(steps: readonly WorkStep[], live: boolean): string {
  const current = steps.findLast((step) => step.state === 'running');
  if (live && current !== undefined) {
    return current.title;
  }
  return live ? 'Working' : `Used ${plural(steps.length, 'tool')}`;
}

export function WorkSummary({
  steps,
  live,
}: {
  readonly steps: readonly WorkStep[];
  readonly live: boolean;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const shown = useAssistantStatus()?.settings.activity_steps !== false;
  if (!shown || steps.length === 0) {
    return null;
  }
  return (
    <View className="gap-1">
      <Interactive
        label={open ? 'Hide steps' : 'Show steps'}
        onPress={() => {
          setOpen(!open);
        }}
        className="min-h-touch-min flex-row items-center gap-1.5 self-start rounded-full pr-2"
        layerClassName="rounded-full"
      >
        <Icon name={live ? 'loader' : 'wrench'} size={16} tone="variant" />
        <Text variant="footnote" tone="variant" numberOfLines={1} className="shrink">
          {summaryOf(steps, live)}
        </Text>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={16} tone="variant" />
      </Interactive>
      {open ? (
        <View className="gap-1 border-l-2 border-outline-variant pl-3">
          {steps.map((step) => (
            <View key={step.key} className="flex-row items-start gap-2">
              <Icon name={STEP_ICON[step.state]} size={16} tone={STEP_TONE[step.state]} />
              <Text variant="footnote" tone="variant" className="min-w-0 flex-1">
                {step.title}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
