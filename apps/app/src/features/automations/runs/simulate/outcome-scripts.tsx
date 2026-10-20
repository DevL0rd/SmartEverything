import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../../components/button';
import { IconButton } from '../../../../components/icon-button';
import { NumberStepper } from '../../../../components/number-stepper';
import { Segmented } from '../../../../components/segmented';
import { Text } from '../../../../components/text';
import { TextField } from '../../../../components/text-field';
import { OUTCOME_LABEL, SCRIPT_OUTCOMES, type ScriptRow } from './scenario-model';

export interface OutcomeScriptsProps {
  readonly rows: readonly ScriptRow[];
  readonly disabled: boolean;
  readonly newId: () => string;
  readonly onChange: (rows: readonly ScriptRow[]) => void;
}

const DEFAULT_SLOW_SECONDS = 30;

function Extra({
  row,
  disabled,
  onRow,
}: {
  readonly row: ScriptRow;
  readonly disabled: boolean;
  readonly onRow: (row: ScriptRow) => void;
}): ReactNode {
  if (row.outcome === 'fail') {
    return (
      <TextField
        label="Why it fails"
        value={row.message}
        disabled={disabled}
        onChange={(message) => {
          onRow({ ...row, message });
        }}
      />
    );
  }
  if (row.outcome === 'slow') {
    return (
      <NumberStepper
        label="Seconds until it answers"
        value={row.delaySeconds}
        min={1}
        max={3600}
        step={1}
        unit="s"
        disabled={disabled}
        onChange={(delaySeconds) => {
          onRow({ ...row, delaySeconds });
        }}
      />
    );
  }
  return null;
}

function ScriptCard({
  row,
  disabled,
  onRow,
  onRemove,
}: {
  readonly row: ScriptRow;
  readonly disabled: boolean;
  readonly onRow: (row: ScriptRow) => void;
  readonly onRemove: () => void;
}): ReactNode {
  return (
    <View className="flex-row items-start gap-2 rounded-md bg-surface-2 p-3">
      <View className="min-w-0 flex-1 gap-2">
        <TextField
          label="Device or target (empty for every command)"
          value={row.target}
          disabled={disabled}
          onChange={(target) => {
            onRow({ ...row, target });
          }}
        />
        <Segmented
          label="What happens to the command"
          disabled={disabled}
          value={row.outcome}
          options={SCRIPT_OUTCOMES.map((value) => ({ value, label: OUTCOME_LABEL[value] }))}
          onChange={(outcome) => {
            onRow({ ...row, outcome });
          }}
        />
        <Extra row={row} disabled={disabled} onRow={onRow} />
      </View>
      <IconButton icon="close" label="Remove this outcome" disabled={disabled} onPress={onRemove} />
    </View>
  );
}

export function OutcomeScripts({
  rows,
  disabled,
  newId,
  onChange,
}: OutcomeScriptsProps): ReactNode {
  return (
    <View className="gap-3">
      <Text variant="body-strong">What happens to commands</Text>
      <Text variant="footnote" tone="variant">
        By default every command works. Add a row to make one fail, answer slowly or look offline.
      </Text>
      {rows.map((row) => (
        <ScriptCard
          key={row.id}
          row={row}
          disabled={disabled}
          onRow={(next) => {
            onChange(rows.map((known) => (known.id === row.id ? next : known)));
          }}
          onRemove={() => {
            onChange(rows.filter((known) => known.id !== row.id));
          }}
        />
      ))}
      <View className="flex-row">
        <Button
          label="Script an outcome"
          icon="plus"
          variant="outlined"
          disabled={disabled}
          onPress={() => {
            onChange([
              ...rows,
              {
                id: newId(),
                target: '',
                outcome: 'fail',
                message: '',
                delaySeconds: DEFAULT_SLOW_SECONDS,
              },
            ]);
          }}
        />
      </View>
    </View>
  );
}
