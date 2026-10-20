import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { JsonValue } from '@smarteverything/domain';
import { Button } from '../../../../components/button';
import { IconButton } from '../../../../components/icon-button';
import { Segmented } from '../../../../components/segmented';
import { Text } from '../../../../components/text';
import { TextField } from '../../../../components/text-field';
import type { PretendRow } from './test-model';

export interface OverridesProps {
  readonly rows: readonly PretendRow[];
  readonly disabled: boolean;
  readonly automationId: string;
  readonly newId: () => string;
  readonly onChange: (rows: readonly PretendRow[]) => void;
}

type ValueKind = 'on' | 'off' | 'number' | 'text';

function kindOf(value: JsonValue): ValueKind {
  if (typeof value === 'boolean') return value ? 'on' : 'off';
  return typeof value === 'number' ? 'number' : 'text';
}

function valueOf(kind: ValueKind, text: string): JsonValue {
  if (kind === 'on') return true;
  if (kind === 'off') return false;
  if (kind === 'number') return Number.isFinite(Number(text)) ? Number(text) : 0;
  return text;
}

function textOf(value: JsonValue): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function ValueEditor({
  row,
  disabled,
  onValue,
}: {
  readonly row: PretendRow;
  readonly disabled: boolean;
  readonly onValue: (value: JsonValue) => void;
}): ReactNode {
  const kind = kindOf(row.value);
  return (
    <View className="gap-2">
      <Segmented
        label="Pretend value type"
        disabled={disabled}
        value={kind}
        options={[
          { value: 'on', label: 'On' },
          { value: 'off', label: 'Off' },
          { value: 'number', label: 'Number' },
          { value: 'text', label: 'Text' },
        ]}
        onChange={(next) => {
          onValue(valueOf(next, textOf(row.value)));
        }}
      />
      {kind === 'number' || kind === 'text' ? (
        <TextField
          label="Value"
          value={textOf(row.value)}
          disabled={disabled}
          onChange={(text) => {
            onValue(valueOf(kind, text));
          }}
        />
      ) : null}
    </View>
  );
}

function RowFields({
  row,
  disabled,
  onRow,
}: {
  readonly row: PretendRow;
  readonly disabled: boolean;
  readonly onRow: (row: PretendRow) => void;
}): ReactNode {
  return (
    <View className="min-w-0 flex-1 gap-2">
      {row.kind === 'device' ? (
        <View className="flex-row flex-wrap gap-2">
          <TextField
            label="Device"
            value={row.device}
            disabled={disabled}
            onChange={(device) => {
              onRow({ ...row, device });
            }}
          />
          <TextField
            label="Control"
            value={row.control}
            disabled={disabled}
            onChange={(control) => {
              onRow({ ...row, control });
            }}
          />
        </View>
      ) : (
        <TextField
          label="Remembered value name"
          value={row.name}
          disabled={disabled}
          onChange={(name) => {
            onRow({ ...row, name });
          }}
        />
      )}
      <ValueEditor
        row={row}
        disabled={disabled}
        onValue={(value) => {
          onRow({ ...row, value });
        }}
      />
    </View>
  );
}

function AddButtons({ rows, disabled, automationId, newId, onChange }: OverridesProps): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-2">
      <Button
        label="Pretend a device value"
        variant="outlined"
        disabled={disabled}
        onPress={() => {
          onChange([
            ...rows,
            { id: newId(), kind: 'device', device: '', control: '', value: true },
          ]);
        }}
      />
      <Button
        label="Pretend a remembered value"
        variant="outlined"
        disabled={disabled}
        onPress={() => {
          onChange([
            ...rows,
            { id: newId(), kind: 'variable', automationId, name: '', value: true },
          ]);
        }}
      />
    </View>
  );
}

export function Overrides({
  rows,
  disabled,
  automationId,
  newId,
  onChange,
}: OverridesProps): ReactNode {
  return (
    <View className="gap-3">
      <Text variant="body-strong">Pretend</Text>
      <Text variant="footnote" tone="variant">
        Change what the test sees. Your home is not touched.
      </Text>
      {rows.map((row) => (
        <View key={row.id} className="flex-row items-start gap-2 rounded-md bg-surface-2 p-3">
          <RowFields
            row={row}
            disabled={disabled}
            onRow={(next) => {
              onChange(rows.map((known) => (known.id === row.id ? next : known)));
            }}
          />
          <IconButton
            icon="close"
            label="Remove this pretend value"
            disabled={disabled}
            onPress={() => {
              onChange(rows.filter((known) => known.id !== row.id));
            }}
          />
        </View>
      ))}
      <AddButtons
        rows={rows}
        disabled={disabled}
        automationId={automationId}
        newId={newId}
        onChange={onChange}
      />
    </View>
  );
}
