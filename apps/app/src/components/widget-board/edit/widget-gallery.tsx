import type { ReactNode } from 'react';
import { useState } from 'react';
import { View, type ViewStyle } from 'react-native';
import { WIDGET_FOOTPRINTS, type BoardClass, type WidgetSize } from '@smarteverything/domain';
import { Icon } from '../../icon';
import { Interactive } from '../../interactive';
import { Sheet } from '../../sheet';
import { Text } from '../../text';
import { frameOf, spanWidth, type Cell } from '../board-geometry';
import type { WidgetDefinition } from '../types';
import { SIZE_LABELS, placeableSize, sizeOptions } from './edit-model';

const OTHER_GROUP = 'More widgets';

function groupsOf(
  definitions: readonly WidgetDefinition[],
): readonly (readonly [string, readonly WidgetDefinition[]])[] {
  const groups = new Map<string, WidgetDefinition[]>();
  for (const definition of definitions) {
    const group = definition.group ?? OTHER_GROUP;
    groups.set(group, [...(groups.get(group) ?? []), definition]);
  }
  return [...groups.entries()];
}

function previewBox(height: number): { readonly height: number } {
  return { height };
}

function scaledFrame(width: number, height: number, scale: number): ViewStyle {
  return { width, height, transform: [{ scale }], transformOrigin: 'top left' };
}

function Preview({
  definition,
  size,
  board,
  cell,
}: {
  readonly definition: WidgetDefinition;
  readonly size: WidgetSize;
  readonly board: BoardClass;
  readonly cell: Cell;
}): ReactNode {
  const [width, setWidth] = useState(0);
  const footprint = WIDGET_FOOTPRINTS[board][size];
  const frame = frameOf(cell, {
    col: 0,
    row: 0,
    cols: footprint.columns,
    rows: footprint.rows,
    height:
      definition.aspect === undefined
        ? undefined
        : spanWidth(cell, footprint.columns) / definition.aspect,
  });
  const scale = frame.width === 0 ? 0 : Math.min(1, width / frame.width);
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={previewBox(frame.height * scale)}
      className="w-full overflow-hidden"
      onLayout={(event) => {
        setWidth(event.nativeEvent.layout.width);
      }}
    >
      {scale === 0 ? null : (
        <View style={scaledFrame(frame.width, frame.height, scale)}>
          {definition.render({ size, options: undefined, editing: true })}
        </View>
      )}
    </View>
  );
}

function Entry({
  definition,
  board,
  cell,
  onAdd,
}: {
  readonly definition: WidgetDefinition;
  readonly board: BoardClass;
  readonly cell: Cell;
  readonly onAdd: (type: string) => void;
}): ReactNode {
  const size = placeableSize(definition, board);
  if (size === null) {
    return null;
  }
  const sizes = sizeOptions(definition, board).map((option) => SIZE_LABELS[option.size]);
  return (
    <Interactive
      label={`Add ${definition.title}`}
      onPress={() => {
        onAdd(definition.type);
      }}
      className="gap-3 rounded-lg bg-surface-2 p-3"
      layerClassName="rounded-lg"
    >
      <Preview definition={definition} size={size} board={board} cell={cell} />
      <View className="flex-row items-center gap-3">
        <Icon name={definition.icon} size={20} />
        <View className="min-w-0 flex-1">
          <Text variant="body-strong" numberOfLines={1}>
            {definition.title}
          </Text>
          <Text variant="footnote" tone="variant" numberOfLines={1}>
            {sizes.join(' · ')}
          </Text>
        </View>
        <Icon name="plus" size={20} tone="primary" />
      </View>
    </Interactive>
  );
}

export interface WidgetGalleryProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly definitions: readonly WidgetDefinition[];
  readonly board: BoardClass;
  readonly cell: Cell;
  readonly onAdd: (type: string) => void;
}

export function WidgetGallery(props: WidgetGalleryProps): ReactNode {
  const { open, onClose, definitions, board, cell, onAdd } = props;
  return (
    <Sheet open={open} onClose={onClose} title="Add widget" kind="inspector" detents={['full']}>
      {definitions.length === 0 ? (
        <Text variant="body" tone="variant" className="py-6 text-center">
          Everything you can add is already on this page.
        </Text>
      ) : (
        <View className="gap-6 pt-2">
          {groupsOf(definitions).map(([group, entries]) => (
            <View key={group} className="gap-3">
              <Text variant="footnote" tone="variant">
                {group}
              </Text>
              {entries.map((definition) => (
                <Entry
                  key={definition.type}
                  definition={definition}
                  board={board}
                  cell={cell}
                  onAdd={onAdd}
                />
              ))}
            </View>
          ))}
        </View>
      )}
    </Sheet>
  );
}
