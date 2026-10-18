import type { ReactNode } from 'react';
import { Interactive } from '../../../../components/interactive';
import { Text } from '../../../../components/text';
import { cn } from '../../../../design/cn';

export function LibraryChip({
  label,
  active,
  onPress,
}: {
  readonly label: string;
  readonly active: boolean;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <Interactive
      label={label}
      selected={active}
      onPress={onPress}
      className={cn(
        'min-h-touch-min flex-row items-center rounded-full border-hairline px-3',
        active ? 'border-primary bg-primary-container' : 'border-outline-variant bg-surface-1',
      )}
      layerClassName="rounded-full"
    >
      <Text variant="label" tone={active ? 'primary' : 'default'} numberOfLines={1}>
        {label}
      </Text>
    </Interactive>
  );
}
