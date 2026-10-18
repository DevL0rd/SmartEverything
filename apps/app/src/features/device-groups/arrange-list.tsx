import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../components/icon';
import { ReorderableList } from '../../components/reorderable-list';
import { Text } from '../../components/text';
import { useRooms } from '../../store/selectors';
import type { Device } from '../../store/state';
import { arrangeItems, reordered, type ArrangeItem } from './model/arrange';

function ArrangeRow({ item }: { readonly item: ArrangeItem }): ReactNode {
  return (
    <View className="min-h-touch-min flex-row items-center gap-3 py-2 pl-12 pr-3">
      <Icon name={item.light ? 'bulb' : 'plug'} size={20} />
      <View className="min-w-0 flex-1">
        <Text variant="callout" numberOfLines={1}>
          {item.name}
        </Text>
        <Text variant="footnote" tone="variant" numberOfLines={1}>
          {item.caption}
        </Text>
      </View>
    </View>
  );
}

export function ArrangeList({
  devices,
  members,
  onChange,
}: {
  readonly devices: readonly Device[];
  readonly members: readonly string[];
  readonly onChange: (members: readonly string[]) => void;
}): ReactNode {
  const rooms = useRooms();
  const items = arrangeItems(devices, rooms, members);
  if (items.length === 0)
    return (
      <Text variant="callout" tone="variant">
        Choose devices first. They can be put in order here.
      </Text>
    );
  return (
    <View className="gap-2">
      <Text variant="footnote" tone="variant">
        This order is used on the group page, in the Home widget and by automations. Drag the
        handle, or focus a row and use the move actions.
      </Text>
      <ReorderableList
        items={items}
        keyOf={(item) => item.id}
        labelOf={(item) => item.name}
        renderItem={(item) => <ArrangeRow item={item} />}
        onReorder={(keys) => {
          onChange(reordered(members, keys));
        }}
      />
    </View>
  );
}
