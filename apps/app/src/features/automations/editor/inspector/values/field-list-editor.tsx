import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { JsonValue } from '@smarteverything/domain';
import { Button } from '../../../../../components/button';
import { Select } from '../../../../../components/select';
import type { FieldControl } from '../schema-fields';
import { addedEntry, objectOf, withEntry, withoutEntry, type JsonObject } from './composite-model';
import type { LiteralProps } from './literal-scalar';
import { NothingYet, RemoveRow, RowName, RowsEditor } from './rows-editor';

interface TypeOption {
  readonly id: string;
  readonly label: string;
}

function FieldRow({
  name,
  held,
  options,
  label,
  disabled,
  onChange,
}: {
  readonly name: string;
  readonly held: JsonObject;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly label: string;
  readonly disabled: boolean;
  readonly onChange: (value: JsonValue) => void;
}): ReactNode {
  const type = held[name];
  return (
    <View className="flex-row items-end gap-2">
      <View className="min-w-0 flex-1">
        <RowName name={name} held={held} rule="ident" disabled={disabled} onChange={onChange} />
      </View>
      <View className="min-w-0 flex-1">
        <Select
          label={`${name} type`}
          showLabel={false}
          disabled={disabled}
          value={typeof type === 'string' ? type : null}
          placeholder="Pick a type"
          options={options}
          onChange={(next) => {
            onChange(withEntry(held, name, next));
          }}
        />
      </View>
      <RemoveRow
        name={name}
        owner={label}
        disabled={disabled}
        onPress={() => {
          onChange(withoutEntry(held, name));
        }}
      />
    </View>
  );
}

export function FieldListEditor({
  types,
  label,
  value,
  disabled,
  onChange,
}: Omit<LiteralProps<never>, 'control'> & { readonly types: readonly TypeOption[] }): ReactNode {
  const held = objectOf(value);
  const names = Object.keys(held);
  const options = types.map((type) => ({ value: type.id, label: type.label }));
  const first = types[0]?.id ?? '';
  return (
    <View className="gap-3">
      {names.map((name) => (
        <FieldRow
          key={name}
          name={name}
          held={held}
          options={options}
          label={label}
          disabled={disabled}
          onChange={onChange}
        />
      ))}
      {names.length === 0 ? <NothingYet /> : null}
      <Button
        label="Add a field"
        spoken={`Add a field to ${label}`}
        icon="plus"
        variant="text"
        disabled={disabled || first === ''}
        onPress={() => {
          onChange(addedEntry(held, 'field', first));
        }}
      />
    </View>
  );
}

type Render = (props: LiteralProps<FieldControl>) => ReactNode;

export function FieldRowsLiteral(
  props: LiteralProps<FieldControl> & {
    readonly base: FieldControl;
    readonly fallbackItem: FieldControl;
    readonly render: Render;
  },
): ReactNode {
  const { base, fallbackItem, render, ...rest } = props;
  if (base.t === 'entries' && base.item.t === 'choice') {
    return <FieldListEditor {...rest} types={base.item.options} />;
  }
  if (base.t === 'entries') return <RowsEditor {...rest} item={base.item} render={render} />;
  if (base.t === 'json') return render({ ...rest, control: base });
  return <RowsEditor {...rest} item={fallbackItem} render={render} />;
}
