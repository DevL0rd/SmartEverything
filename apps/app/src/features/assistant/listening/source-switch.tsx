import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { SwitchTrack } from '../../../components/switch';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import { selectionTick } from '../../../platform/haptics';

export interface SourceSwitchProps {
  readonly label: string;
  readonly who: string;
  readonly value: boolean;
  readonly onChange: (value: boolean) => void;
  readonly disabled: boolean;
  readonly fixed: boolean;
  readonly mixed?: boolean;
  readonly className?: string;
}

function FixedValue({ value }: { readonly value: boolean }): ReactNode {
  return (
    <View className="flex-row items-center gap-1">
      <Icon name={value ? 'check' : 'minus'} size={16} tone={value ? 'positive' : 'faint'} />
      <Text variant="footnote">{value ? 'On' : 'Off'}</Text>
    </View>
  );
}

export function SourceSwitch({
  label,
  who,
  value,
  onChange,
  disabled,
  fixed,
  mixed = false,
  className,
}: SourceSwitchProps): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const frame = cn(
    'flex-row items-center justify-between gap-2',
    pointer ? 'min-h-8' : 'min-h-touch-min',
    className,
  );
  const caption = (
    <Text variant="footnote" tone={disabled ? 'faint' : 'variant'} numberOfLines={1}>
      {label}
    </Text>
  );
  if (fixed) {
    return (
      <View className={frame}>
        {caption}
        <FixedValue value={value} />
      </View>
    );
  }
  return (
    <Interactive
      role="switch"
      label={`${who}: ${label.toLowerCase()}`}
      checked={value}
      disabled={disabled}
      onPress={() => {
        selectionTick();
        onChange(!value);
      }}
      className={cn(frame, disabled && 'opacity-40')}
    >
      {caption}
      <SwitchTrack value={value} mixed={mixed} />
    </Interactive>
  );
}
