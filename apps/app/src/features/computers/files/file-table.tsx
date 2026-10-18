import type { ReactNode } from 'react';
import { View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import type { FileEntry } from '@smarteverything/domain';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { parentOf, type RowAction } from './file-model';
import { FileRowView } from './file-row';

export interface FileTableProps {
  readonly entries: readonly FileEntry[];
  readonly wide: boolean;
  readonly canAttach: boolean;
  readonly showPath: boolean;
  readonly selected: ReadonlySet<string>;
  readonly selecting: boolean;
  readonly loadingMore: boolean;
  readonly stale: boolean;
  readonly onMore: () => void;
  readonly onAction: (action: RowAction, entry: FileEntry) => void;
}

function Header(): ReactNode {
  return (
    <View className="flex-row items-center gap-3 border-b border-outline-variant bg-surface-2 pl-4 pr-1">
      <Text variant="label" tone="variant" className="min-h-10 min-w-0 flex-1 pl-8 pt-3">
        Name
      </Text>
      <Text variant="label" tone="variant" align="end" className="w-21 pt-0.5">
        Size
      </Text>
      <Text variant="label" tone="variant" align="end" className="w-22 pt-0.5">
        Modified
      </Text>
      <View className="w-10" />
    </View>
  );
}

export function FileTable(props: FileTableProps): ReactNode {
  const { entries, wide, canAttach, showPath, selected, selecting, loadingMore, stale } = props;
  const { onMore, onAction } = props;
  return (
    <>
      {wide ? <Header /> : null}
      <View className={stale ? 'min-h-0 flex-1 opacity-60' : 'min-h-0 flex-1'}>
        <FlashList
          data={entries}
          extraData={selected}
          keyExtractor={(entry) => entry.path}
          onEndReachedThreshold={1}
          onEndReached={onMore}
          ListFooterComponent={loadingMore ? <Skeleton shape="line" className="m-4 h-8" /> : null}
          renderItem={({ item }) => (
            <FileRowView
              entry={item}
              wide={wide}
              canAttach={canAttach}
              detail={showPath ? parentOf(item.path) : null}
              selecting={selecting}
              selected={selected.has(item.path)}
              onAction={onAction}
            />
          )}
        />
      </View>
    </>
  );
}
