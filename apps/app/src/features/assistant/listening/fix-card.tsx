import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Icon, type IconName } from '../../../components/icon';
import { Text } from '../../../components/text';
import type { Tone } from '../../../components/tone';

export function FixCard({
  icon,
  tone = 'warning',
  title,
  body,
  done = false,
  action,
}: {
  readonly icon: IconName;
  readonly tone?: Tone;
  readonly title: string;
  readonly body: string;
  readonly done?: boolean;
  readonly action?: { readonly label: string; readonly onPress: () => void };
}): ReactNode {
  return (
    <View className="flex-row items-start gap-3 rounded-lg bg-surface-2 px-4 py-3">
      <View className="pt-0.5">
        <Icon name={done ? 'circleCheck' : icon} tone={done ? 'positive' : tone} />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="body">{title}</Text>
        <Text variant="footnote" tone="variant">
          {body}
        </Text>
        {action === undefined || done ? null : (
          <View className="-ml-1 mt-1.5 self-start">
            <Button label={action.label} variant="tonal" onPress={action.onPress} />
          </View>
        )}
      </View>
    </View>
  );
}
