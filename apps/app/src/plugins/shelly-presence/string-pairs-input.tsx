import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { JsonValue } from '@smarteverything/domain';
import { TextField } from '../../components/text-field';
import { Text } from '../../components/text';
import { Button } from '../../components/button';
import type { PresenceFormObject } from './form-model';

interface Pair {
  readonly name: string;
  readonly value: string;
}
function PairRow({
  title,
  row,
  index,
  change,
  remove,
}: {
  readonly title: string;
  readonly row: Pair;
  readonly index: number;
  readonly change: (value: Pair) => void;
  readonly remove: () => void;
}): ReactNode {
  return (
    <View className="gap-2">
      <TextField
        label={`${title} ${String(index + 1)} name`}
        value={row.name}
        onChange={(name) => {
          change({ ...row, name });
        }}
      />
      <TextField
        label={`${title} ${String(index + 1)} value`}
        value={row.value}
        onChange={(value) => {
          change({ ...row, value });
        }}
      />
      <Button label="Remove entry" variant="text" onPress={remove} />
    </View>
  );
}

interface StringPairsProps {
  readonly title: string;
  readonly value: PresenceFormObject;
  readonly change: (value: JsonValue) => void;
}
export function StringPairsInput({ title, value, change }: StringPairsProps): ReactNode {
  const [rows, setRows] = useState<readonly Pair[]>(
    Object.entries(value).map(([name, entry]) => ({
      name,
      value: typeof entry === 'string' ? entry : '',
    })),
  );
  const publish = (next: readonly Pair[]): void => {
    setRows(next);
    const valid =
      next.every((row) => row.name.trim() !== '') &&
      new Set(next.map((row) => row.name)).size === next.length;
    change(
      valid
        ? Object.fromEntries(next.map((row) => [row.name, row.value]))
        : next.map((row) => [row.name, row.value]),
    );
  };
  return (
    <View className="gap-3">
      <PairValidity rows={rows} />
      {rows.map((row, index) => (
        <PairRow
          key={index}
          title={title}
          row={row}
          index={index}
          change={(next) => {
            publish(rows.map((item, at) => (at === index ? next : item)));
          }}
          remove={() => {
            publish(rows.filter((_, at) => at !== index));
          }}
        />
      ))}
      <Button
        label={`Add ${title.toLowerCase()} entry`}
        icon="plus"
        variant="tonal"
        onPress={() => {
          publish([...rows, { name: '', value: '' }]);
        }}
      />
    </View>
  );
}

function PairValidity({ rows }: { readonly rows: readonly Pair[] }): ReactNode {
  return rows.some((row) => row.name.trim() === '') ||
    new Set(rows.map((row) => row.name)).size !== rows.length ? (
    <Text tone="critical">Each entry needs a unique name before saving.</Text>
  ) : null;
}
