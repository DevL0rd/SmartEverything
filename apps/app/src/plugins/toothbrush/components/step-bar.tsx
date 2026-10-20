import type { BrushProfile } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import type { Step } from '../model/brush-model';
import { stepCaption } from '../model/stage-model';

const FILL: Readonly<Record<Step['state'], string>> = {
  done: 'bg-positive',
  current: 'bg-primary',
  todo: 'bg-surface-3',
};

export function StepBar({
  profile,
  steps,
}: {
  readonly profile: BrushProfile;
  readonly steps: readonly Step[];
}): ReactNode {
  const caption = stepCaption(profile, steps);
  return (
    <View accessible accessibilityLabel={caption} className="gap-1.5">
      <View aria-hidden className="flex-row gap-1">
        {steps.map((step, index) => (
          <View key={index} className={cn('h-2 flex-1 rounded-full', FILL[step.state])} />
        ))}
      </View>
      <Text variant="footnote" tone="variant" numberOfLines={1}>
        {caption}
      </Text>
    </View>
  );
}
