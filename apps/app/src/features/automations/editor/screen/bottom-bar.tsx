import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../../../../design/cn';
import { Icon } from '../../../../components/icon';
import { Interactive } from '../../../../components/interactive';
import { Text } from '../../../../components/text';
import type { BottomItem, BottomItemId } from './screen-model';

export interface BottomBarProps {
  readonly items: readonly BottomItem[];
  readonly onItem: (id: BottomItemId) => void;
}

function Entry({
  item,
  onItem,
}: {
  readonly item: BottomItem;
  readonly onItem: (id: BottomItemId) => void;
}): ReactNode {
  const tone = item.disabled ? 'faint' : item.active ? 'primary' : 'variant';
  return (
    <Interactive
      label={item.label}
      selected={item.active}
      disabled={item.disabled}
      onPress={() => {
        onItem(item.id);
      }}
      className={cn(
        'min-h-touch-min min-w-16 items-center justify-center rounded-full px-3',
        item.active && 'bg-primary-container',
      )}
      layerClassName="rounded-full"
    >
      <Icon name={item.icon} size={20} tone={tone} />
      <Text variant="caption" tone={tone} numberOfLines={1}>
        {item.label}
      </Text>
    </Interactive>
  );
}

export const BottomBar = memo(function BottomBar({ items, onItem }: BottomBarProps): ReactNode {
  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 bottom-0 items-center px-4 pb-safe-offset-2"
    >
      <View
        accessibilityRole="toolbar"
        accessibilityLabel="Editor actions"
        className="flex-row items-center gap-1 rounded-full border border-outline-variant bg-surface-raised px-2 py-1 elevation-3"
      >
        {items.map((item) => (
          <Entry key={item.id} item={item} onItem={onItem} />
        ))}
      </View>
    </View>
  );
});
