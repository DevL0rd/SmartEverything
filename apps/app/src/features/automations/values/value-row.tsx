import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AutomationValueRow } from '@smarteverything/domain';
import { operateValue } from '../../../api/automation-runtime';
import { IconButton } from '../../../components/icon-button';
import { ListRow } from '../../../components/list-row';
import { Switch } from '../../../components/switch';
import { attempt } from '../shared/actions';
import { VALUE_TYPE_LABELS, quickOperation, valueText } from './value-content';
import { background } from '@smarteverything/logging';

type Direction = 'up' | 'down' | 'toggle' | 'next';

function applyQuick(row: AutomationValueRow, direction: Direction): void {
  background(
    attempt(
      'The Value didn’t change',
      () => operateValue(row.id, quickOperation(row.content, direction)),
      { action: 'quick-value', valueId: row.id, direction },
    ),
    'value_row.attempt_failed',
  );
}

function QuickControl({ row }: { readonly row: AutomationValueRow }): ReactNode {
  const { content } = row;
  const apply = (direction: Direction): void => {
    applyQuick(row, direction);
  };
  if (content.kind === 'boolean')
    return (
      <Switch
        label={content.name}
        value={content.value}
        onChange={() => {
          apply('toggle');
        }}
      />
    );
  if (content.kind === 'choice')
    return (
      <IconButton
        icon="chevronRight"
        label={`Next choice for ${content.name}`}
        onPress={() => {
          apply('next');
        }}
      />
    );
  return (
    <View className="flex-row">
      <IconButton
        icon="minus"
        label={`Lower ${content.name}`}
        onPress={() => {
          apply('down');
        }}
      />
      <IconButton
        icon="plus"
        label={`Raise ${content.name}`}
        onPress={() => {
          apply('up');
        }}
      />
    </View>
  );
}

export function ValueRowItem({
  row,
  onOpen,
}: {
  readonly row: AutomationValueRow;
  readonly onOpen: (id: string) => void;
}): ReactNode {
  return (
    <ListRow
      title={row.content.name}
      subtitle={`${VALUE_TYPE_LABELS[row.content.kind]} · ${valueText(row.content)}`}
      trailing={<QuickControl row={row} />}
      onPress={() => {
        onOpen(row.id);
      }}
    />
  );
}
