import { useImperativeHandle, useRef, type ReactNode, type Ref } from 'react';
import { View } from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { Button } from '../../../../components/button';
import { ListLoader } from '../../../../components/list-loader';
import { Text } from '../../../../components/text';
import { LibraryRowItem } from './library-row';
import { scrollTarget, type LibraryMode } from './library-model';
import type { LibraryRow } from './library-rows';

export interface LibraryListApi {
  readonly reveal: (index: number) => void;
}

export interface LibraryListProps {
  readonly rows: readonly LibraryRow[];
  readonly mode: LibraryMode;
  readonly rowHeight: number;
  readonly shownKey: string | null;
  readonly onSelect: (key: string) => void;
  readonly onFavourite: ((id: string) => void) | null;
  readonly count: string;
  readonly more: (() => void) | null;
  readonly loading: boolean;
  readonly ref: Ref<LibraryListApi>;
}

function Footer({
  count,
  more,
  loading,
}: Pick<LibraryListProps, 'count' | 'more' | 'loading'>): ReactNode {
  return (
    <View className="items-center gap-2 p-4">
      <Text variant="caption" tone="variant" accessibilityLiveRegion="polite" className="tabular">
        {count}
      </Text>
      {more === null ? null : <Button label="Load more" variant="outlined" onPress={more} />}
      <ListLoader loading={loading} />
    </View>
  );
}

export function LibraryList({ ref, ...props }: LibraryListProps): ReactNode {
  const { rows, mode, rowHeight, shownKey, onSelect, onFavourite } = props;
  const list = useRef<FlashListRef<LibraryRow>>(null);
  const position = useRef({ offset: 0, viewport: 0 });
  useImperativeHandle(ref, () => ({
    reveal: (index): void => {
      const target = scrollTarget(
        index,
        rowHeight,
        position.current.offset,
        position.current.viewport,
      );
      if (target !== null) list.current?.scrollToOffset({ offset: target, animated: false });
    },
  }));
  return (
    <View className="min-h-0 flex-1">
      <FlashList
        ref={list}
        data={rows}
        keyExtractor={(row) => row.key}
        renderItem={({ item }) => (
          <View className="px-2">
            <LibraryRowItem
              row={item}
              mode={mode}
              shown={item.key === shownKey}
              onSelect={onSelect}
              onFavourite={onFavourite}
            />
          </View>
        )}
        onScroll={(event) => {
          position.current = {
            offset: event.nativeEvent.contentOffset.y,
            viewport: event.nativeEvent.layoutMeasurement.height,
          };
        }}
        scrollEventThrottle={64}
        keyboardShouldPersistTaps="handled"
        ListFooterComponent={
          <Footer count={props.count} more={props.more} loading={props.loading} />
        }
      />
    </View>
  );
}
