import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useIsFocused } from 'expo-router';
import { cn } from '../design/cn';
import { useSizeClass } from '../design/size-class';
import { Button } from './button';
import { Icon, type IconName } from './icon';
import { Interactive } from './interactive';
import { Text } from './text';
import { useToastObstacle } from './toast-obstacles';

export interface PrimaryActionProps {
  readonly label: string;
  readonly icon: IconName;
  readonly onPress: () => void;
  readonly extended?: boolean;
}

export function usePrimaryActionPlacement(): 'fab' | 'header' {
  const size = useSizeClass();
  return size.idiom === 'touch' && (size.width === 'compact' || size.width === 'medium')
    ? 'fab'
    : 'header';
}

export function PrimaryAction({
  label,
  icon,
  onPress,
  extended = true,
}: PrimaryActionProps): ReactNode {
  const placement = usePrimaryActionPlacement();
  const { attach, onLayout } = useToastObstacle('bottom', useIsFocused() && placement === 'fab');
  if (placement === 'header') {
    return <Button label={label} icon={icon} onPress={onPress} />;
  }
  return (
    <View
      ref={attach}
      onLayout={onLayout}
      pointerEvents="box-none"
      className="absolute bottom-4 right-4"
    >
      <Interactive
        label={label}
        onPress={onPress}
        onTone="primary"
        className={cn(
          'h-14 flex-row items-center justify-center gap-3 rounded-lg bg-primary elevation-3',
          extended ? 'px-5' : 'w-14',
        )}
        layerClassName="rounded-lg"
      >
        <Icon name={icon} size={24} tone="onPrimary" />
        {extended ? (
          <Text variant="label" tone="onPrimary">
            {label}
          </Text>
        ) : null}
      </Interactive>
    </View>
  );
}
