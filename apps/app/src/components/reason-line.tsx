import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from './button';
import { Icon, type IconName } from './icon';
import { Text } from './text';
import type { Tone } from './tone';

export interface ReasonAction {
  readonly label: string;
  readonly onPress: () => void;
}

export interface ReasonLineProps {
  readonly text: string;
  readonly icon?: IconName;
  readonly tone?: Tone;
  readonly action?: ReasonAction;
}

export function ReasonLine({
  text,
  icon = 'info',
  tone = 'variant',
  action,
}: ReasonLineProps): ReactNode {
  return (
    <View accessibilityRole="summary" className="flex-row items-start gap-2">
      <View className="pt-px">
        <Icon name={icon} size={16} tone={tone} />
      </View>
      <View className="min-w-0 flex-1 items-start gap-1">
        <Text variant="footnote" tone="variant">
          {text}
        </Text>
        {action === undefined ? null : (
          <Button label={action.label} variant="text" onPress={action.onPress} />
        )}
      </View>
    </View>
  );
}
