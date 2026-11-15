import type { ReactNode } from 'react';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';

export interface EditorChipProps {
  readonly label: string;
  readonly icon?: IconName;
  readonly selected?: boolean;
  readonly disabled?: boolean;
  readonly onPress: () => void;
}

export function EditorChip({
  label,
  icon,
  selected = false,
  disabled = false,
  onPress,
}: EditorChipProps): ReactNode {
  return (
    <Interactive
      label={label}
      role="button"
      selected={selected}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        'min-h-touch-min flex-row items-center gap-2 rounded-full border px-4',
        selected ? 'border-primary bg-primary-container' : 'border-outline-variant bg-surface-2',
      )}
      layerClassName="rounded-full"
    >
      {icon === undefined ? null : (
        <Icon name={icon} size={18} tone={selected ? 'onPrimaryContainer' : 'default'} />
      )}
      <Text variant="label" tone={selected ? 'onPrimaryContainer' : 'default'}>
        {label}
      </Text>
    </Interactive>
  );
}
