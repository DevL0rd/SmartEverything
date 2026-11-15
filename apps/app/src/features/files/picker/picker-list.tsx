import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { FolderGlyph } from '../../../components/files/folder-glyph';
import { ErrorState } from '../../../components/error-state';
import { Icon } from '../../../components/icon';
import { ListRow } from '../../../components/list-row';
import { Skeleton } from '../../../components/skeleton';
import { cn } from '../../../design/cn';
import type { FolderListing } from '../source/types';
import type { PickerMode, PickerRow } from './picker-model';
import { emptyTextOf, emptyTitleOf } from './picker-model';

function Separator(): ReactNode {
  return <View className="ml-16 h-hairline bg-outline-variant" />;
}

function Loading({ compact }: { readonly compact: boolean }): ReactNode {
  return (
    <View
      className={cn('gap-3 py-3', compact ? 'px-2' : 'px-4')}
      accessibilityLabel="Reading this folder"
    >
      {(compact ? [0, 1] : [0, 1, 2, 3, 4, 5]).map((slot) => (
        <Skeleton key={slot} shape="line" className="h-10" />
      ))}
    </View>
  );
}

function More({ more }: { readonly more: (() => void) | null }): ReactNode {
  if (more === null) return <View className="h-2" />;
  return (
    <View className="items-start px-4 py-3">
      <Button label="Show more" variant="text" onPress={more} />
    </View>
  );
}

export interface PickerListProps<O> {
  readonly listing: FolderListing<O>;
  readonly rows: readonly PickerRow<O>[];
  readonly mode: PickerMode;
  readonly canCreate: boolean;
  readonly compact: boolean;
  readonly onPress: (row: PickerRow<O>) => void;
}

function Check({ picked }: { readonly picked: boolean }): ReactNode {
  return (
    <Icon name={picked ? 'circleCheck' : 'circle'} size={20} tone={picked ? 'primary' : 'faint'} />
  );
}

function FolderLeading<O>({
  row,
  compact,
}: {
  readonly row: PickerRow<O>;
  readonly compact: boolean;
}): ReactNode {
  const glyph = (
    <FolderGlyph look={{ colour: row.node.marks.colour, iconHint: row.node.marks.iconHint }} />
  );
  return compact ? glyph : <View className="size-10 items-center justify-center">{glyph}</View>;
}

function Rows<O>({ listing, rows, mode, compact, onPress }: PickerListProps<O>): ReactNode {
  const many = mode === 'files';
  const renderItem = ({ item }: { readonly item: PickerRow<O> }): ReactElement => {
    const box = many && !item.opens;
    return (
      <ListRow
        compact={compact}
        title={item.node.name}
        {...(item.caption === null ? {} : { subtitle: item.caption })}
        {...(item.node.kind === 'folder'
          ? { leading: <FolderLeading row={item} compact={compact} /> }
          : { icon: item.icon })}
        chevron={item.opens}
        disabled={!item.enabled}
        selected={item.picked}
        {...(box
          ? {
              role: 'checkbox' as const,
              checked: item.picked,
              trailing: <Check picked={item.picked} />,
            }
          : {})}
        onPress={() => {
          onPress(item);
        }}
      />
    );
  };
  return (
    <View
      className={cn(
        'min-h-0',
        compact ? 'shrink grow-0 px-1.5' : 'flex-1',
        listing.stale && 'opacity-60',
      )}
    >
      <FlashList
        data={rows}
        keyExtractor={(row) => row.node.key}
        ListFooterComponent={<More more={listing.more} />}
        renderItem={renderItem}
        {...(compact ? {} : { ItemSeparatorComponent: Separator })}
      />
    </View>
  );
}

export function PickerList<O>(props: PickerListProps<O>): ReactNode {
  const { listing, rows, mode, canCreate, compact } = props;
  if (listing.error !== null && listing.error !== undefined) {
    return (
      <View className={cn('py-3', compact ? 'px-2' : 'px-4')}>
        <ErrorState error={listing.error} retry={listing.retry} />
      </View>
    );
  }
  if (rows.length === 0 && listing.loading) return <Loading compact={compact} />;
  if (rows.length === 0) {
    return (
      <EmptyState
        compact={compact}
        icon="folder"
        title={emptyTitleOf(mode)}
        body={emptyTextOf(mode, canCreate)}
      />
    );
  }
  return <Rows {...props} />;
}
