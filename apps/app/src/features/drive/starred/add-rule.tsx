import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SMART_RULE_ITEM_KINDS } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { IconButton } from '../../../components/icon-button';
import { Select } from '../../../components/select';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import {
  ADD_FIELDS,
  leafOfAdding,
  type AddField,
  type AddingRow,
  type RuleKind,
} from './rule-chips';
import { KIND_WORD } from './rule-labels';

const KIND_OPTIONS: readonly { readonly value: RuleKind; readonly label: string }[] =
  SMART_RULE_ITEM_KINDS.map((kind) => ({ value: kind, label: KIND_WORD[kind] }));

const TEXT_LABEL = { name: 'Name has', path: 'Path has' } as const;

const SINCE_LABEL = { added: 'Added since', changed: 'Changed since' } as const;

const DAY_HINT = 'Year, month and day, like 2026-11-01';

interface ValueProps {
  readonly row: AddingRow;
  readonly onEdit: (row: AddingRow) => void;
  readonly onSubmit: () => void;
}

function ContainsField({
  row,
  onEdit,
  onSubmit,
}: ValueProps & {
  readonly row: Extract<AddingRow, { readonly field: 'name' | 'path' }>;
}): ReactNode {
  return (
    <TextField
      label={TEXT_LABEL[row.field]}
      value={row.contains}
      showLabel={false}
      placeholder={TEXT_LABEL[row.field]}
      focusOnMount
      onSubmit={onSubmit}
      onChange={(contains) => {
        onEdit({ ...row, contains });
      }}
    />
  );
}

function RowValue({ row, onEdit, onSubmit }: ValueProps): ReactNode {
  switch (row.field) {
    case 'kind':
      return (
        <Select
          label="Kind is"
          options={KIND_OPTIONS}
          value={row.kind}
          showLabel={false}
          onChange={(kind) => {
            onEdit({ ...row, kind });
          }}
        />
      );
    case 'name':
    case 'path':
      return <ContainsField row={row} onEdit={onEdit} onSubmit={onSubmit} />;
    case 'added':
    case 'changed':
      return (
        <TextField
          label={SINCE_LABEL[row.field]}
          value={row.since}
          showLabel={false}
          placeholder="2026-11-01"
          helper={DAY_HINT}
          onSubmit={onSubmit}
          onChange={(since) => {
            onEdit({ ...row, since });
          }}
        />
      );
    case 'starred':
      return (
        <Text variant="callout" tone="variant">
          Only files and folders with a star
        </Text>
      );
  }
}

export interface AddRuleProps {
  readonly row: AddingRow;
  readonly canCancel: boolean;
  readonly onRetype: (field: AddField) => void;
  readonly onEdit: (row: AddingRow) => void;
  readonly onAdd: () => void;
  readonly onCancel: () => void;
}

export function AddRuleRow({
  row,
  canCancel,
  onRetype,
  onEdit,
  onAdd,
  onCancel,
}: AddRuleProps): ReactNode {
  const ready = leafOfAdding(row) !== null;
  return (
    <View className="gap-2 rounded-md bg-surface-2 p-2">
      <View className="flex-row items-center gap-2">
        <View className="flex-1">
          <Select
            label="Rule"
            options={ADD_FIELDS}
            value={row.field}
            showLabel={false}
            onChange={onRetype}
          />
        </View>
        {canCancel ? (
          <IconButton icon="close" label="Stop adding a rule" onPress={onCancel} />
        ) : null}
      </View>
      <RowValue
        row={row}
        onEdit={onEdit}
        onSubmit={() => {
          if (ready) onAdd();
        }}
      />
      <View className="flex-row justify-end">
        <Button label="Add rule" icon="plus" variant="tonal" disabled={!ready} onPress={onAdd} />
      </View>
    </View>
  );
}
