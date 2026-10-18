import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { BoardClass, BoardWidget } from '@smarteverything/domain';
import { EmptyState } from '../../empty-state';
import { SearchField } from '../../search-field';
import type { Cell } from '../board-geometry';
import { usePickerState } from '../picker-source';
import type { TargetRow } from '../types';
import {
  entrySize,
  galleryGroups,
  suggestionsOf,
  type GalleryGroup,
  type GalleryItem,
} from './gallery-model';
import { GalleryPreview } from './gallery-preview';
import { GroupTitle, PreviewRow, usePreviewWidth } from './gallery-rows';

export interface BrowseStepProps {
  readonly items: readonly GalleryItem[];
  readonly placed: readonly BoardWidget[];
  readonly board: BoardClass;
  readonly cell: Cell;
  readonly query: string;
  readonly onQuery: (query: string) => void;
  readonly onOpen: (item: GalleryItem) => void;
  readonly onAdd: (item: GalleryItem, row: TargetRow | null) => void;
}

type Shared = Pick<BrowseStepProps, 'board' | 'cell' | 'onAdd'>;

function Preview({
  item,
  row,
  board,
  cell,
}: Pick<BrowseStepProps, 'board' | 'cell'> & {
  readonly item: GalleryItem;
  readonly row: TargetRow | null;
}): ReactNode {
  const size = entrySize(item, board);
  const maxWidth = usePreviewWidth();
  return size === null ? null : (
    <GalleryPreview
      definition={item.definition}
      size={size}
      board={board}
      cell={cell}
      options={row === null ? undefined : row.options}
      maxWidth={maxWidth}
    />
  );
}

function Suggested({
  items,
  placed,
  board,
  cell,
  onAdd,
}: Shared & {
  readonly items: readonly GalleryItem[];
  readonly placed: readonly BoardWidget[];
}): ReactNode {
  const suggestions = suggestionsOf(items, usePickerState(), placed);
  if (suggestions.length === 0) {
    return null;
  }
  return (
    <View className="gap-2">
      <GroupTitle title="Suggested" />
      {suggestions.map(({ item, row }) => (
        <PreviewRow
          key={`${item.id}:${row.key}`}
          title={row.title}
          subtitle={row.subtitle}
          icon={item.entry.icon}
          onPress={() => {
            onAdd(item, row);
          }}
          preview={<Preview item={item} row={row} board={board} cell={cell} />}
        />
      ))}
    </View>
  );
}

function Group({
  group,
  board,
  cell,
  onAdd,
  onOpen,
}: Shared & {
  readonly group: GalleryGroup;
  readonly onOpen: BrowseStepProps['onOpen'];
}): ReactNode {
  return (
    <View className="gap-2">
      <GroupTitle title={group.title} />
      {group.items.map((item) => (
        <PreviewRow
          key={item.id}
          title={item.entry.title}
          subtitle={item.entry.subtitle}
          icon={item.entry.icon}
          chevron={item.entry.pick !== undefined}
          onPress={() => {
            if (item.entry.pick === undefined) {
              onAdd(item, null);
            } else {
              onOpen(item);
            }
          }}
          preview={<Preview item={item} row={null} board={board} cell={cell} />}
        />
      ))}
    </View>
  );
}

export function BrowseStep(props: BrowseStepProps): ReactNode {
  const { items, query, onQuery } = props;
  const groups = galleryGroups(items, query);
  const suggests = query === '' && items.some((item) => item.entry.pick?.suggestions !== undefined);
  return (
    <View className="gap-4 pt-2">
      <SearchField
        value={query}
        onChange={onQuery}
        placeholder="Find a widget, light or group"
        variant="field"
      />
      {suggests ? <Suggested {...props} /> : null}
      {groups.map((group) => (
        <Group key={group.title} group={group} {...props} />
      ))}
      {groups.length === 0 ? (
        <EmptyState
          icon="search"
          title="No widgets match"
          body={`Nothing found for "${query}". Try a room or a device name.`}
          compact
        />
      ) : null}
    </View>
  );
}
