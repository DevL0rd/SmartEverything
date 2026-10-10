import type { ReactNode, RefObject } from 'react';
import { View } from 'react-native';
import { Icon } from './icon';
import type { IconName } from './icon-glyphs';
import { Interactive } from './interactive';
import { Text } from './text';
import { cn } from '../design/cn';

export interface FilterChipProps {
  readonly label: string;
  readonly value: string;
  readonly icon: IconName;
  readonly active: boolean;
  readonly onPress: () => void;
  readonly anchorRef?: RefObject<View | null>;
}

export function FilterChip({
  label,
  value,
  icon,
  active,
  onPress,
  anchorRef,
}: FilterChipProps): ReactNode {
  return (
    <View ref={anchorRef}>
      <Interactive
        label={`${label}: ${value}`}
        selected={active}
        onPress={onPress}
        className={cn(
          'min-h-touch-min max-w-72 flex-row items-center gap-1.5 rounded-full border-hairline px-3',
          active ? 'border-primary bg-primary-container' : 'border-outline-variant bg-surface-1',
        )}
        layerClassName="rounded-full"
      >
        <Icon name={icon} size={16} tone={active ? 'primary' : 'variant'} />
        <Text
          variant="label"
          tone={active ? 'primary' : 'default'}
          numberOfLines={1}
          className="shrink"
        >
          {value}
        </Text>
        <Icon name="chooser" size={16} tone="faint" />
      </Interactive>
    </View>
  );
}
