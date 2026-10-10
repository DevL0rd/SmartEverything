import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { useAnchoredMenu, type MenuItem } from '../../../components/menu';

export function AddMenu({
  label,
  items,
}: {
  readonly label: string;
  readonly items: readonly MenuItem[];
}): ReactNode {
  const { ref, open, menu } = useAnchoredMenu(items, label);
  return (
    <View ref={ref} collapsable={false} className="flex-row">
      <Button
        label={label}
        icon="plus"
        variant="tonal"
        disabled={items.length === 0}
        onPress={open}
      />
      {menu}
    </View>
  );
}
