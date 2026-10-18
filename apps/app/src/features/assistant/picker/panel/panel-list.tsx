import { useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { Text } from '../../../../components/text';
import { PanelRowItem } from './panel-row';
import type { PanelEntry } from './panel-items';
import type { ScrollMemory } from './panel-state';

export interface PanelListProps {
  readonly entries: readonly PanelEntry[];
  readonly branchesOn: (key: string) => boolean;
  readonly onFavourite: ((id: string) => void) | null;
  readonly memory: ScrollMemory;
  readonly footer: ReactNode;
}

function Entry({
  entry,
  branchesOn,
  onFavourite,
}: Pick<PanelListProps, 'branchesOn' | 'onFavourite'> & { readonly entry: PanelEntry }): ReactNode {
  switch (entry.type) {
    case 'header':
      return (
        <View className="h-list-header justify-end px-3 pb-1">
          <Text variant="label" tone="variant" accessibilityRole="header">
            {entry.title}
          </Text>
        </View>
      );
    case 'hint':
      return (
        <Text variant="footnote" tone="variant" className="px-3 pb-2">
          {entry.text}
        </Text>
      );
    case 'row':
      return (
        <View className="px-2">
          <PanelRowItem
            row={entry.row}
            branches={branchesOn(entry.row.key)}
            onFavourite={onFavourite}
          />
        </View>
      );
  }
}

export function PanelList({
  entries,
  branchesOn,
  onFavourite,
  memory,
  footer,
}: PanelListProps): ReactNode {
  const list = useRef<FlashListRef<PanelEntry>>(null);
  const restored = useRef(false);
  return (
    <View className="min-h-0 flex-1">
      <FlashList
        ref={list}
        data={entries}
        keyExtractor={(entry) => entry.key}
        getItemType={(entry) => entry.type}
        renderItem={({ item }) => (
          <Entry entry={item} branchesOn={branchesOn} onFavourite={onFavourite} />
        )}
        onScroll={(event) => {
          memory.remember(event.nativeEvent.contentOffset.y);
        }}
        onContentSizeChange={() => {
          if (restored.current) return;
          restored.current = true;
          list.current?.scrollToOffset({ offset: memory.offset(), animated: false });
        }}
        scrollEventThrottle={64}
        keyboardShouldPersistTaps="handled"
        ListFooterComponent={<>{footer}</>}
      />
    </View>
  );
}
