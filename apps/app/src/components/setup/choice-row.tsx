import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../../design/cn';
import { Icon, type IconName } from '../icon';
import { Interactive } from '../interactive';
import { Text } from '../text';

export interface ChoiceRowProps {
  readonly icon: IconName;
  readonly title: string;
  readonly subtitle: string;
  readonly selected: boolean;
  readonly onPress: () => void;
}

export function ChoiceRow({ icon, title, subtitle, selected, onPress }: ChoiceRowProps): ReactNode {
  return (
    <Interactive
      role="radio"
      checked={selected}
      label={`${title}. ${subtitle}`}
      onPress={onPress}
      className={cn(
        'min-h-touch-min flex-row items-center gap-3 rounded-lg border px-4 py-3',
        selected ? 'border-primary bg-primary-container/30' : 'border-outline-variant bg-surface-2',
      )}
    >
      <Icon name={icon} size={24} tone={selected ? 'primary' : 'variant'} />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="body-strong">{title}</Text>
        <Text variant="footnote" tone="variant">
          {subtitle}
        </Text>
      </View>
      <Icon
        name={selected ? 'circleCheck' : 'circle'}
        size={20}
        tone={selected ? 'primary' : 'faint'}
      />
    </Interactive>
  );
}
