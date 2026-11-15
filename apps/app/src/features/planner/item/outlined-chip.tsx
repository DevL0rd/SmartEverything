import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';

export interface OutlinedChipProps {
  readonly label: string;
  readonly spoken: string;
  readonly icon: IconName;
  readonly trailing?: IconName | undefined;
  readonly disabled: boolean;
  readonly onPress: () => void;
}

export function OutlinedChip({
  label,
  spoken,
  icon,
  trailing,
  disabled,
  onPress,
}: OutlinedChipProps): ReactNode {
  const pointer = useIdiom() === 'pointer';
  return (
    <Interactive
      role="button"
      label={spoken}
      disabled={disabled}
      onPress={onPress}
      className={cn('max-w-72 justify-center', pointer ? 'min-h-8' : 'min-h-touch-min')}
      layerClassName="rounded-full"
    >
      <View
        className={cn(
          'min-h-8 flex-row items-center gap-1.5 rounded-full border border-outline pl-2.5',
          trailing === undefined ? 'pr-3' : 'pr-2',
        )}
      >
        <Icon name={icon} size={16} tone="variant" />
        <Text variant="label" className="shrink" numberOfLines={1}>
          {label}
        </Text>
        {trailing === undefined ? null : <Icon name={trailing} size={16} tone="variant" />}
      </View>
    </Interactive>
  );
}
