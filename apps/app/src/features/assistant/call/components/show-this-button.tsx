import type { ReactNode } from 'react';
import { Icon } from '../../../../components/icon';
import { Interactive } from '../../../../components/interactive';
import { Text } from '../../../../components/text';

export function ShowThisButton({ onPress }: { readonly onPress: () => void }): ReactNode {
  return (
    <Interactive
      label="Show this. Take one still picture for the assistant"
      onPress={onPress}
      className="min-h-touch-min flex-row items-center gap-2 self-center rounded-full bg-surface-2 px-5 elevation-1"
      layerClassName="rounded-full"
    >
      <Icon name="eye" size={20} tone="default" />
      <Text variant="label">Show this</Text>
    </Interactive>
  );
}
