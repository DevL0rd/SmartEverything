import type { ReactNode } from 'react';
import { View } from 'react-native';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';
import { pagerLabel, type RequestNav } from './needs-you-model';

export function DockPager({
  nav,
  change,
}: {
  readonly nav: RequestNav;
  readonly change: (id: string) => void;
}): ReactNode {
  if (nav.count <= 1) return null;
  const { previous, next } = nav;
  return (
    <View className="flex-row items-center">
      <Text variant="caption" tone="variant">
        {pagerLabel(nav)}
      </Text>
      <IconButton
        icon="chevronLeft"
        label="Previous request"
        disabled={previous === null}
        onPress={() => {
          if (previous !== null) change(previous);
        }}
      />
      <IconButton
        icon="chevronRight"
        label="Next request"
        disabled={next === null}
        onPress={() => {
          if (next !== null) change(next);
        }}
      />
    </View>
  );
}
