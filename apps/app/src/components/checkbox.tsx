import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../design/cn';
import { selectionTick } from '../platform/haptics';
import { Icon } from './icon';
import { Interactive } from './interactive';
import { Text } from './text';

export interface CheckboxProps {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly label: string;
  readonly disabled?: boolean;
}

export function Checkbox({ checked, onChange, label, disabled = false }: CheckboxProps): ReactNode {
  return (
    <Interactive
      role="checkbox"
      label={label}
      selected={checked}
      checked={checked}
      disabled={disabled}
      onPress={() => {
        selectionTick();
        onChange(!checked);
      }}
      className="min-h-touch-min flex-row items-center gap-3 rounded-sm"
      layerClassName="rounded-sm"
    >
      <View
        className={cn(
          'size-5 items-center justify-center rounded-xs border-2',
          checked ? 'border-primary bg-primary' : 'border-on-surface-variant',
        )}
      >
        {checked ? <Icon name="check" size={16} tone="onPrimary" /> : null}
      </View>
      <Text variant="body" className="flex-1">
        {label}
      </Text>
    </Interactive>
  );
}
