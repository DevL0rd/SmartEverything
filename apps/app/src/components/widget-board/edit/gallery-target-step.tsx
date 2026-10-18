import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { BoardClass, BoardWidget, WidgetSize } from '@smarteverything/domain';
import { EmptyState } from '../../empty-state';
import { IconButton } from '../../icon-button';
import { SearchField } from '../../search-field';
import { Segmented } from '../../segmented';
import { Text } from '../../text';
import type { Cell } from '../board-geometry';
import { usePickerState } from '../picker-source';
import type { TargetPicker } from '../types';
import { SIZE_LABELS, sizeOptions } from './edit-model';
import {
  targetGroups,
  type GalleryItem,
  type TargetGroup,
  type TargetOption,
} from './gallery-model';
import { GalleryPreview } from './gallery-preview';
import { GroupTitle, PreviewRow, usePreviewWidth } from './gallery-rows';

export interface TargetStepProps {
  readonly item: GalleryItem;
  readonly picker: TargetPicker;
  readonly placed: readonly BoardWidget[];
  readonly board: BoardClass;
  readonly cell: Cell;
  readonly size: WidgetSize;
  readonly picked: TargetOption | null;
  readonly onPick: (row: TargetOption) => void;
  readonly onSize: (size: WidgetSize) => void;
  readonly onBack: () => void;
}

function SizeRow({
  item,
  board,
  size,
  onSize,
}: Pick<TargetStepProps, 'item' | 'board' | 'size' | 'onSize'>): ReactNode {
  const options = sizeOptions(item.definition, board);
  if (options.length < 2) {
    return null;
  }
  return (
    <View className="gap-2">
      <Text variant="footnote" tone="variant">
        Size
      </Text>
      <Segmented
        label="Widget size"
        value={size}
        onChange={onSize}
        options={options.map((option) => ({
          value: option.size,
          label: SIZE_LABELS[option.size],
        }))}
      />
    </View>
  );
}

function TargetGroups({
  groups,
  props,
}: {
  readonly groups: readonly TargetGroup[];
  readonly props: TargetStepProps;
}): ReactNode {
  const { item, board, cell, size, picked, onPick } = props;
  const maxWidth = usePreviewWidth();
  return groups.map((group) => (
    <View key={group.title} className="gap-2">
      <GroupTitle title={group.title} />
      {group.rows.map((row) => (
        <PreviewRow
          key={row.key}
          title={row.title}
          subtitle={row.note === undefined ? row.subtitle : `${row.subtitle} · ${row.note}`}
          selected={picked?.key === row.key}
          tag={row.onPage ? 'On this page' : undefined}
          onPress={() => {
            onPick(row);
          }}
          preview={
            <GalleryPreview
              definition={item.definition}
              size={size}
              board={board}
              cell={cell}
              options={row.options}
              maxWidth={maxWidth}
            />
          }
        />
      ))}
    </View>
  ));
}

export function TargetStep(props: TargetStepProps): ReactNode {
  const { item, picker, placed, picked, onBack } = props;
  const state = usePickerState();
  const [query, setQuery] = useState('');
  const ofType = placed.filter((widget) => widget.type === item.definition.type);
  const groups = targetGroups(picker.sections(state, ofType), ofType, query);
  return (
    <View className="gap-4 pt-2">
      <View className="flex-row items-center gap-1">
        <IconButton icon="chevronLeft" label="Back to widgets" onPress={onBack} />
        <Text variant="body-strong">{item.entry.title}</Text>
      </View>
      <SearchField value={query} onChange={setQuery} placeholder="Find one" variant="field" />
      {groups.length === 0 ? (
        <EmptyState
          icon="search"
          title="Nothing to choose"
          body="Nothing here matches yet. Add a device or group first, or change the search."
          compact
        />
      ) : (
        <TargetGroups groups={groups} props={props} />
      )}
      {picked === null ? null : <SizeRow {...props} />}
    </View>
  );
}
