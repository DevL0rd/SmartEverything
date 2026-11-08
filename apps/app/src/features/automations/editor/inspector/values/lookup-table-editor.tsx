import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../../../components/button';
import { IconButton } from '../../../../../components/icon-button';
import { Select } from '../../../../../components/select';
import { Text } from '../../../../../components/text';
import type { FieldControl } from '../schema-fields';
import {
  CELL_KINDS,
  cellKindOf,
  cellStart,
  lookupRowsOf,
  tableOf,
  withCell,
  withColumnKind,
  type CellKind,
  type Column,
  type LookupRow,
} from './composite-model';
import type { LiteralProps } from './literal-scalar';
import { NothingYet } from './rows-editor';

type Render = (props: LiteralProps<FieldControl>) => ReactNode;

const CELL_CONTROLS: Readonly<Record<CellKind, FieldControl>> = {
  text: { t: 'text' },
  number: { t: 'number', integer: false, min: undefined, max: undefined, step: 1, unit: undefined },
  flag: { t: 'switch' },
  mixed: { t: 'json' },
};

const COLUMN_TITLES: Readonly<Record<Column, string>> = { key: 'When the key is', value: 'Give' };

function ColumnKind({
  column,
  kind,
  disabled,
  onPick,
}: {
  readonly column: Column;
  readonly kind: CellKind;
  readonly disabled: boolean;
  readonly onPick: (kind: Exclude<CellKind, 'mixed'>) => void;
}): ReactNode {
  return (
    <View className="min-w-0 flex-1 gap-1">
      <Text variant="footnote" tone="variant">
        {COLUMN_TITLES[column]}
      </Text>
      <Select
        label={`${COLUMN_TITLES[column]} type`}
        showLabel={false}
        disabled={disabled}
        value={kind === 'mixed' ? null : kind}
        placeholder="Mixed types"
        options={CELL_KINDS}
        onChange={onPick}
      />
    </View>
  );
}

function TableHead({
  rows,
  kinds,
  disabled,
  onRows,
}: {
  readonly rows: readonly LookupRow[];
  readonly kinds: Readonly<Record<Column, CellKind>>;
  readonly disabled: boolean;
  readonly onRows: (rows: readonly LookupRow[]) => void;
}): ReactNode {
  const columns: readonly Column[] = ['key', 'value'];
  return (
    <View className="flex-row items-end gap-2 pr-13">
      {columns.map((column) => (
        <ColumnKind
          key={column}
          column={column}
          kind={kinds[column]}
          disabled={disabled}
          onPick={(kind) => {
            onRows(withColumnKind(rows, column, kind));
          }}
        />
      ))}
    </View>
  );
}

function TableRow({
  rows,
  at,
  kinds,
  disabled,
  onRows,
  render,
}: {
  readonly rows: readonly LookupRow[];
  readonly at: number;
  readonly kinds: Readonly<Record<Column, CellKind>>;
  readonly disabled: boolean;
  readonly onRows: (rows: readonly LookupRow[]) => void;
  readonly render: Render;
}): ReactNode {
  const row = rows[at];
  if (row === undefined) return null;
  const cell = (column: Column): ReactNode => (
    <View className="min-w-0 flex-1">
      {render({
        control: CELL_CONTROLS[kinds[column]],
        label: `Row ${String(at + 1)} ${column}`,
        value: row[column],
        disabled,
        showLabel: false,
        onChange: (next) => {
          onRows(withCell(rows, at, column, next));
        },
      })}
    </View>
  );
  return (
    <View className="flex-row items-center gap-2">
      {cell('key')}
      {cell('value')}
      <IconButton
        icon="trash"
        label={`Remove row ${String(at + 1)}`}
        tone="critical"
        disabled={disabled}
        onPress={() => {
          onRows(rows.filter((_held, index) => index !== at));
        }}
      />
    </View>
  );
}

export function LookupTableEditor({
  label,
  value,
  disabled,
  onChange,
  render,
}: Omit<LiteralProps<FieldControl>, 'control'> & { readonly render: Render }): ReactNode {
  const rows = lookupRowsOf(value);
  const kinds: Readonly<Record<Column, CellKind>> = {
    key: cellKindOf(rows.map((row) => row.key)),
    value: cellKindOf(rows.map((row) => row.value)),
  };
  const onRows = (next: readonly LookupRow[]): void => {
    onChange(tableOf(next));
  };
  return (
    <View className="gap-2">
      <TableHead rows={rows} kinds={kinds} disabled={disabled} onRows={onRows} />
      {rows.map((_row, at) => (
        <TableRow
          key={at}
          rows={rows}
          at={at}
          kinds={kinds}
          disabled={disabled}
          onRows={onRows}
          render={render}
        />
      ))}
      {rows.length === 0 ? <NothingYet /> : null}
      <Button
        label="Add a row"
        spoken={`Add a row to ${label}`}
        icon="plus"
        variant="text"
        disabled={disabled}
        onPress={() => {
          onRows([...rows, { key: cellStart(kinds.key), value: cellStart(kinds.value) }]);
        }}
      />
    </View>
  );
}
