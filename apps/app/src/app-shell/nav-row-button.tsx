import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon, type IconName } from '../components/icon';
import { Interactive } from '../components/interactive';
import { useAnchoredMenu, type MenuItem } from '../components/menu';
import { cn } from '../design/cn';

export function NavRowButton({
  icon,
  label,
  onPress,
  hidden = false,
}: {
  readonly icon: IconName;
  readonly label: string;
  readonly onPress: () => void;
  readonly hidden?: boolean;
}): ReactNode {
  return (
    <Interactive
      role="button"
      label={label}
      onPress={onPress}
      className={cn('size-8 items-center justify-center rounded-full', hidden && 'opacity-0')}
      layerClassName="rounded-full"
    >
      <Icon name={icon} size={16} tone="variant" />
    </Interactive>
  );
}

export function NavRowMenuButton({
  items,
  label,
  hidden = false,
}: {
  readonly items: readonly MenuItem[];
  readonly label: string;
  readonly hidden?: boolean;
}): ReactNode {
  const { ref, open, menu } = useAnchoredMenu(items, label);
  return (
    <View ref={ref} collapsable={false}>
      <NavRowButton icon="ellipsis" label={label} onPress={open} hidden={hidden} />
      {menu}
    </View>
  );
}
