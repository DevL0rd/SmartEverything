import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../../components/button';
import { IconButton } from '../../../../components/icon-button';
import { Segmented } from '../../../../components/segmented';
import { Text } from '../../../../components/text';
import { TextField } from '../../../../components/text-field';
import type { ExpectationRow } from './scenario-model';

export interface ExpectationRowsProps {
  readonly rows: readonly ExpectationRow[];
  readonly disabled: boolean;
  readonly newId: () => string;
  readonly onChange: (rows: readonly ExpectationRow[]) => void;
}

interface RowProps<T extends ExpectationRow> {
  readonly row: T;
  readonly disabled: boolean;
  readonly onRow: (row: ExpectationRow) => void;
}

type Kind<K extends ExpectationRow['kind']> = Extract<ExpectationRow, { readonly kind: K }>;

function StatusFields({ row, disabled, onRow }: RowProps<Kind<'status'>>): ReactNode {
  return (
    <Segmented
      label="The run should"
      disabled={disabled}
      value={row.equals}
      options={[
        { value: 'succeeded', label: 'Succeed' },
        { value: 'failed', label: 'Fail' },
      ]}
      onChange={(equals) => {
        onRow({ ...row, equals });
      }}
    />
  );
}

function CommandFields({ row, disabled, onRow }: RowProps<Kind<'command'>>): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-2">
      <TextField
        label="Command it sends"
        value={row.effect}
        disabled={disabled}
        onChange={(effect) => {
          onRow({ ...row, effect });
        }}
      />
      <TextField
        label="To (optional)"
        value={row.target}
        disabled={disabled}
        onChange={(target) => {
          onRow({ ...row, target });
        }}
      />
    </View>
  );
}

function VisitedFields({ row, disabled, onRow }: RowProps<Kind<'visited'>>): ReactNode {
  return (
    <View className="gap-2">
      <TextField
        label="Step"
        value={row.node}
        disabled={disabled}
        onChange={(node) => {
          onRow({ ...row, node });
        }}
      />
      <Segmented
        label="The step"
        disabled={disabled}
        value={row.visited ? 'runs' : 'skipped'}
        options={[
          { value: 'runs', label: 'Runs' },
          { value: 'skipped', label: 'Does not run' },
        ]}
        onChange={(next) => {
          onRow({ ...row, visited: next === 'runs' });
        }}
      />
    </View>
  );
}

function Fields({ row, disabled, onRow }: RowProps<ExpectationRow>): ReactNode {
  if (row.kind === 'status') return <StatusFields row={row} disabled={disabled} onRow={onRow} />;
  if (row.kind === 'command') return <CommandFields row={row} disabled={disabled} onRow={onRow} />;
  return <VisitedFields row={row} disabled={disabled} onRow={onRow} />;
}

function AddButtons({
  disabled,
  newId,
  onAdd,
}: {
  readonly disabled: boolean;
  readonly newId: () => string;
  readonly onAdd: (row: ExpectationRow) => void;
}): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-2">
      <Button
        label="Check the result"
        variant="outlined"
        disabled={disabled}
        onPress={() => {
          onAdd({ id: newId(), kind: 'status', equals: 'succeeded' });
        }}
      />
      <Button
        label="Check a command"
        variant="outlined"
        disabled={disabled}
        onPress={() => {
          onAdd({ id: newId(), kind: 'command', effect: '', target: '' });
        }}
      />
      <Button
        label="Check a step"
        variant="outlined"
        disabled={disabled}
        onPress={() => {
          onAdd({ id: newId(), kind: 'visited', node: '', visited: true });
        }}
      />
    </View>
  );
}

export function ExpectationRows({
  rows,
  disabled,
  newId,
  onChange,
}: ExpectationRowsProps): ReactNode {
  return (
    <View className="gap-3">
      <Text variant="body-strong">What must be true</Text>
      {rows.map((row) => (
        <View key={row.id} className="flex-row items-start gap-2 rounded-md bg-surface-2 p-3">
          <View className="min-w-0 flex-1">
            <Fields
              row={row}
              disabled={disabled}
              onRow={(next) => {
                onChange(rows.map((known) => (known.id === row.id ? next : known)));
              }}
            />
          </View>
          <IconButton
            icon="close"
            label="Remove this check"
            disabled={disabled}
            onPress={() => {
              onChange(rows.filter((known) => known.id !== row.id));
            }}
          />
        </View>
      ))}
      <AddButtons
        disabled={disabled}
        newId={newId}
        onAdd={(row) => {
          onChange([...rows, row]);
        }}
      />
    </View>
  );
}
