import { useRef, type ReactNode, type RefObject } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../../components/badge';
import { Button } from '../../../../components/button';
import { IconButton } from '../../../../components/icon-button';
import { ReorderableList } from '../../../../components/reorderable-list';
import { Text } from '../../../../components/text';
import type { PortLine } from '../detail/detail-model';
import type { EditSide } from './use-interface-panel';

export type InterfaceOpener = RefObject<View | null>;

export interface InterfaceRowsProps {
  readonly side: EditSide;
  readonly title: string;
  readonly addLabel: string;
  readonly lines: readonly PortLine[];
  readonly editable: boolean;
  readonly onAdd: (side: EditSide, opener: InterfaceOpener) => void;
  readonly onEdit: (side: 'inputs' | 'outputs', name: string, opener: InterfaceOpener) => void;
  readonly onRemove: (side: EditSide, name: string, opener: InterfaceOpener) => void;
  readonly onReorder: (side: EditSide, order: readonly string[]) => void;
}

type RowProps = Pick<InterfaceRowsProps, 'side' | 'editable' | 'onEdit' | 'onRemove'> & {
  readonly line: PortLine;
};

function Row({ line, side, editable, onEdit, onRemove }: RowProps): ReactNode {
  const edit = useRef<View>(null);
  const remove = useRef<View>(null);
  return (
    <View className="min-h-touch-min flex-row items-center gap-2 border-b border-outline-variant py-1.5">
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="body-strong">
          {line.title}
        </Text>
        <View className="flex-row flex-wrap items-center gap-1.5">
          {side === 'exits' ? null : <Badge label={line.typeText} tone="neutral" />}
          {side === 'exits' ? null : <Badge label={line.requirement} tone="primary" />}
        </View>
        {line.description === null ? null : (
          <Text variant="footnote" tone="variant" numberOfLines={2}>
            {line.description}
          </Text>
        )}
      </View>
      {editable && side !== 'exits' ? (
        <IconButton
          ref={edit}
          icon="pencil"
          label={`Edit ${line.title}`}
          onPress={() => {
            onEdit(side, line.name, edit);
          }}
        />
      ) : null}
      {editable ? (
        <IconButton
          ref={remove}
          icon="trash"
          label={`Remove ${line.title}`}
          onPress={() => {
            onRemove(side, line.name, remove);
          }}
        />
      ) : null}
    </View>
  );
}

export function InterfaceRows(props: InterfaceRowsProps): ReactNode {
  const add = useRef<View>(null);
  return (
    <View className="gap-1">
      <Text variant="label" tone="variant">
        {props.title}
      </Text>
      <ReorderableList
        items={props.lines}
        keyOf={(line) => line.name}
        labelOf={(line) => line.title}
        renderItem={(line) => (
          <Row
            line={line}
            side={props.side}
            editable={props.editable}
            onEdit={props.onEdit}
            onRemove={props.onRemove}
          />
        )}
        onReorder={(order) => {
          props.onReorder(props.side, order);
        }}
      />
      {props.editable ? (
        <View className="flex-row">
          <Button
            ref={add}
            label={props.addLabel}
            icon="plus"
            variant="text"
            onPress={() => {
              props.onAdd(props.side, add);
            }}
          />
        </View>
      ) : null}
    </View>
  );
}
